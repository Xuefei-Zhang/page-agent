/**
 * content script for RemotePageController
 */
import { PageController } from '@page-agent/page-controller'

export function initPageController() {
	let pageController: PageController | null = null
	let intervalID: number | null = null

	const myTabIdPromise = chrome.runtime
		.sendMessage({ type: 'PAGE_CONTROL', action: 'get_my_tab_id' })
		.then((response) => {
			return (response as { tabId: number | null }).tabId
		})
		.catch((error) => {
			console.error('[RemotePageController.ContentScript]: Failed to get my tab id', error)
			return null
		})

	function getPC(): PageController {
		if (!pageController) {
			pageController = new PageController({
				enableMask: false,
				viewportExpansion: 400,
			})
		}
		return pageController
	}

	/**
	 * Accessing `chrome.runtime.id` throws once the extension context is
	 * invalidated (extension reloaded/updated/disabled while this content
	 * script is still alive in an open tab).
	 */
	const isExtensionContextValid = (): boolean => {
		try {
			return !!chrome.runtime?.id
		} catch {
			return false
		}
	}

	intervalID = window.setInterval(async () => {
		if (!isExtensionContextValid()) {
			// Orphaned content script: stop polling instead of throwing
			// 'Extension context invalidated' on every tick.
			if (intervalID !== null) window.clearInterval(intervalID)
			intervalID = null
			return
		}

		try {
			const agentHeartbeat = (await chrome.storage.local.get('agentHeartbeat')).agentHeartbeat
			const now = Date.now()
			const agentInTouch = typeof agentHeartbeat === 'number' && now - agentHeartbeat < 2_000

			const isAgentRunning = (await chrome.storage.local.get('isAgentRunning')).isAgentRunning
			const currentTabId = (await chrome.storage.local.get('currentTabId')).currentTabId

			const shouldShowMask =
				isAgentRunning && agentInTouch && currentTabId === (await myTabIdPromise)

			if (shouldShowMask) {
				const pc = getPC()
				pc.initMask()
				await pc.showMask()
			} else {
				// await getPC().hideMask()
				if (pageController) {
					pageController.hideMask()
					pageController.cleanUpHighlights()
				}
			}

			if (!isAgentRunning && agentInTouch) {
				if (pageController) {
					pageController.dispose()
					pageController = null
				}
			}
		} catch (error) {
			// The context may be invalidated mid-tick (race with a reload); detect
			// it on the next tick and stop quietly instead of spamming errors.
			if (!isExtensionContextValid()) {
				if (intervalID !== null) window.clearInterval(intervalID)
				intervalID = null
				return
			}
			console.warn('[RemotePageController.ContentScript] heartbeat poll failed:', error)
		}
	}, 500)

	chrome.runtime.onMessage.addListener((message, sender, sendResponse): true | undefined => {
		if (message.type !== 'PAGE_CONTROL') {
			// sendResponse({
			// 	success: false,
			// 	error: `[RemotePageController.ContentScript]: Invalid message type: ${message.type}`,
			// })
			return
		}

		const { action, payload } = message
		const methodName = getMethodName(action)

		const pc = getPC() as any

		switch (action) {
			case 'get_last_update_time':
			case 'get_browser_state':
			case 'update_tree':
			case 'clean_up_highlights':
			case 'click_element':
			case 'input_text':
			case 'select_option':
			case 'scroll':
			case 'scroll_horizontally':
			case 'execute_javascript':
				pc[methodName](...(payload || []))
					.then((result: any) => sendResponse(result))
					.catch((error: any) =>
						sendResponse({
							success: false,
							error: error instanceof Error ? error.message : String(error),
						})
					)
				break

			default:
				sendResponse({
					success: false,
					error: `Unknown PAGE_CONTROL action: ${action}`,
				})
		}

		return true
	})
}

function getMethodName(action: string): string {
	switch (action) {
		case 'get_last_update_time':
			return 'getLastUpdateTime' as const
		case 'get_browser_state':
			return 'getBrowserState' as const
		case 'update_tree':
			return 'updateTree' as const
		case 'clean_up_highlights':
			return 'cleanUpHighlights' as const

		// DOM actions

		case 'click_element':
			return 'clickElement' as const
		case 'input_text':
			return 'inputText' as const
		case 'select_option':
			return 'selectOption' as const
		case 'scroll':
			return 'scroll' as const
		case 'scroll_horizontally':
			return 'scrollHorizontally' as const
		case 'execute_javascript':
			return 'executeJavascript' as const

		default:
			return action
	}
}
