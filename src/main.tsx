import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Routes, Route} from 'react-router-dom';
import './index.css';
import App from './App';
import Home from './Home';

////////////////////////////////////////////////////////////////////////////////

// On the public domain (flori.ai) the index route shows the new pre-prod
// Home page; on Cloudflare's preview hosts (*.pages.dev) and on localhost it
// stays as the dev panel so coworkers can keep iterating without bouncing
// through /dev.
const isPublicDomain = /(^|\.)flori\.ai$/.test(window.location.hostname);
const IndexPage = isPublicDomain ? Home : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<IndexPage/>}/>
        <Route path="/home" element={<Home/>}/>
        <Route path="/dev" element={<App/>}/>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
