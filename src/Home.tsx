import {useCallback, useEffect, useMemo, useState} from 'react';
import RiveCharacter from './components/RiveCharacter';
import Background, {pickBgVariant} from './components/home/Background';
import Header from './components/home/Header';
import Footer from './components/home/Footer';
import './Home.css';

////////////////////////////////////////////////////////////////////////////////

const Home = () => {
  const variant = useMemo(pickBgVariant, []);

  const [characterReady, setCharacterReady] = useState(false);

  const handleCharacterReady = useCallback(
    () => setCharacterReady(true),
    []
  );

  // Swap the html background and Mobile Safari URL-bar tint to the variant's
  // sky color while this page is mounted; restore on unmount so the dev page
  // keeps its dark theme.
  useEffect(
    () => {
      const html = document.documentElement;
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      const prevHtmlBg = html.style.backgroundColor;
      const prevThemeColor = meta?.getAttribute('content') ?? null;

      html.style.backgroundColor = variant.skyColor;
      meta?.setAttribute('content', variant.skyColor);

      return () => {
        html.style.backgroundColor = prevHtmlBg;
        if (prevThemeColor !== null) meta?.setAttribute('content', prevThemeColor);
      };
    },
    [variant.skyColor]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <div
      className="home fixed inset-0 overflow-hidden font-sans"
      style={{backgroundColor: variant.skyColor}}
    >
      <Background variant={variant}/>
      <Header/>

      <div className="absolute inset-0 pb-20 z-0 flex items-center justify-center">
        <div className="relative translate-y-[34px]">
          {
            // Soft elliptical shadow under Flori. Painted before the canvas
            // so the character paints on top. `bottom-[108px]` sits the
            // shadow just below Flori's feet inside the 512×512 home canvas.
            // Fades in and scales 95% → 100% so it reads like Flori is
            // landing onto the ground.
            variant.shadowColor &&
            <div
              className="absolute bottom-[108px] left-1/2 w-[160px] h-[36px] rounded-[50%] transition-transform duration-1000 ease-out"
              style={{
                backgroundColor: variant.shadowColor,
                opacity: characterReady ? 1 : 0,
                transform: `translateX(-50%) scale(${characterReady ? 1 : 0.85})`,
              }}
            />
          }

          {/* Flori herself: fades in and lands from -10px above. */}
          <div
            className="transition-[opacity,transform] duration-1000 ease-out"
            style={{
              opacity: characterReady ? 1 : 0,
              transform: `translateY(${characterReady ? 0 : -10}px)`,
            }}
          >
            <RiveCharacter currentViseme="sil" onReady={handleCharacterReady}/>
          </div>
        </div>
      </div>

      <Footer hintColor={variant.hintColor}/>
    </div>
  );
};

export default Home;
