import { createRoot } from 'react-dom/client';
import App from './App';
import { useAppStore } from '~/lib/store';
import './style.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}

window.addEventListener('wxt:store-update', ((event: CustomEvent) => {
  const detail = event.detail ?? {};
  const store = useAppStore.getState();
  if (detail.pairingState) store.setPairingState(detail.pairingState);
  if (detail.sessionState) store.setSessionState(detail.sessionState);
  if (detail.transactionState) store.setTransactionState(detail.transactionState);
  if (detail.transactionData) store.setTransactionData(detail.transactionData);
  if (detail.credentialState) store.setCredentialState(detail.credentialState);
  if (detail.credentialDomain) store.setCredentialDomain(detail.credentialDomain);
}) as EventListener);
