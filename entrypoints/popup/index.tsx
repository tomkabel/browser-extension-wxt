import { createRoot } from 'react-dom/client';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import App from './App';
import './style.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}

export default defineUnlistedScript(() => {});
