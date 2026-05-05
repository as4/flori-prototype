import {useEffect} from 'react';
import RiveCharacter from './components/RiveCharacter';
import Background from './components/home/Background';
import Header from './components/home/Header';
import Footer from './components/home/Footer';
import './Home.css';

////////////////////////////////////////////////////////////////////////////////

const HOME_BG = '#f7edf0';

////////////////////////////////////////////////////////////////////////////////

const Home = () => {
  // Swap the html background and Mobile Safari URL-bar tint to the home
  // pink while this page is mounted; restore on unmount so the dev page
  // keeps its dark theme.
  useEffect(
    () => {
      const html = document.documentElement;
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      const prevHtmlBg = html.style.backgroundColor;
      const prevThemeColor = meta?.getAttribute('content') ?? null;

      html.style.backgroundColor = HOME_BG;
      meta?.setAttribute('content', HOME_BG);

      return () => {
        html.style.backgroundColor = prevHtmlBg;
        if (prevThemeColor !== null) meta?.setAttribute('content', prevThemeColor);
      };
    },
    []
  );

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <div className="home fixed inset-0 overflow-hidden bg-[#f7edf0] font-sans">
      <Background/>
      <Header/>

      <div className="absolute inset-0 pb-20 z-0 flex items-center justify-center">
        <RiveCharacter currentViseme="sil"/>
      </div>

      <Footer/>
    </div>
  );
};

export default Home;
