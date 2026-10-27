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
import './tokens.css';
import './styles.css';
import './design.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
