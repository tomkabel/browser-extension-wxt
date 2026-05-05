package com.smartid.vault.ghostactuator.orchestrator

interface OrchestratorInterface {
    fun onPinEntrySuccess()
    fun onPinEntryFailure(error: PinError)
    fun requestFallbackToManualInteraction()
}
