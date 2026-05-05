import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Routes, Route} from 'react-router-dom';
import './index.css';
import App from './App';
import Home from './Home';

////////////////////////////////////////////////////////////////////////////////

// Home is the default everywhere (flori.ai, localhost, anything custom);
// only Cloudflare's per-deploy preview hosts (*.pages.dev) keep the dev
// panel as their index, since those are the URLs the team uses to iterate.
// Either page is always reachable via /home and /dev explicitly.
const isPagesPreview = /\.pages\.dev$/.test(window.location.hostname);
const IndexPage = isPagesPreview ? App : Home;

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
