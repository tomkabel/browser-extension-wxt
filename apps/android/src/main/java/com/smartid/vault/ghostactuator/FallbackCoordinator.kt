package com.smartid.vault.ghostactuator

interface WebRtcFallback {
    fun requestManualPhoneInteraction()
}

class FallbackCoordinator(
    private val webRtcFallback: WebRtcFallback,
) {
    fun onPersistentFailure() {
        webRtcFallback.requestManualPhoneInteraction()
    }

    fun onServiceDisabled() {
        webRtcFallback.requestManualPhoneInteraction()
    }
}
