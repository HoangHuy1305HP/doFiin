import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-700.css';
import '@fontsource/geist/vietnamese-400.css';
import '@fontsource/geist/vietnamese-700.css';
import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/space-grotesk/vietnamese-400.css';
import '@fontsource/space-grotesk/vietnamese-700.css';
import App from './App';
import EdgeApp from './EdgeApp';
import './tokens.css';
import './styles.css';
import './design.css';
import './edge.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      {import.meta.env.VITE_EDGE_DEMO === '1' ? <EdgeApp /> : <App />}
    </BrowserRouter>
  </React.StrictMode>,
);
