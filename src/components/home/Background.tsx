import _ from 'lodash';
import Cloud1 from '../../assets/cloud-1.svg?react';
import Cloud2 from '../../assets/cloud-2.svg?react';
import Cloud3 from '../../assets/cloud-3.svg?react';
import Cloud4 from '../../assets/cloud-4.svg?react';
import BgPink from '../../assets/home-bg-pink.svg?react';
import BgOrange from '../../assets/home-bg-orange.svg?react';
import BgGreen from '../../assets/home-bg-green.svg?react';

////////////////////////////////////////////////////////////////////////////////

export type BgVariantId = 'clouds' | 'pink' | 'orange' | 'green';

export type BgVariant = {
  id: BgVariantId;
  skyColor: string;
  // Soft elliptical shadow rendered under the character. Null on the clouds
  // variant since today's design has no character shadow.
  shadowColor: string | null;
  // Footer hint ("Hold to speak") color. Green's painted bg uses white/72;
  // the others stay on black/30.
  hintColor: string;
};

const HINT_DARK = 'rgba(0, 0, 0, 0.3)';
const HINT_LIGHT = 'rgba(255, 255, 255, 0.72)';

export const BG_VARIANTS: BgVariant[] = [
  {id: 'clouds', skyColor: '#f7edf0', shadowColor: null,      hintColor: HINT_DARK},
  {id: 'pink',   skyColor: '#FCEFE7', shadowColor: '#F4E4DE', hintColor: HINT_DARK},
  {id: 'orange', skyColor: '#FF9F3F', shadowColor: '#F79D61', hintColor: HINT_DARK},
  {id: 'green',  skyColor: '#78D3F9', shadowColor: '#1C8D20', hintColor: HINT_LIGHT},
];

const CLOUDS_VARIANT = BG_VARIANTS[0];

// The painted variants are mobile-only assets — keep desktop on the existing
// cloud layout (which is calibrated for both 400 and 1280 widths).
export const pickBgVariant = (): BgVariant => {
  const isMobile = window.matchMedia('(max-width: 639px)').matches;
  return isMobile ? _.sample(BG_VARIANTS)! : CLOUDS_VARIANT;
};

////////////////////////////////////////////////////////////////////////////////

const PAINTED: Record<Exclude<BgVariantId, 'clouds'>, React.FC<React.SVGProps<SVGSVGElement>>> = {
  pink: BgPink,
  orange: BgOrange,
  green: BgGreen,
};

////////////////////////////////////////////////////////////////////////////////

type Props = {
  variant: BgVariant;
};

const Background = ({variant}: Props) => {
  if (variant.id !== 'clouds') {
    const Painted = PAINTED[variant.id];

    return (
      <Painted
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }

  // Vertical: clouds anchored to the viewport centre so they follow the
  // centred character into taller windows.
  //
  // Horizontal: each cloud uses a single linear formula `left: calc(N% + Mpx)`
  // (or `right: ...`) calibrated to land on its Mobile Figma X at 400 wide and
  // its Desktop Figma X at 1280 wide. Same approach across all viewport sizes
  // — no breakpoint switches, no pixel anchoring, no edge sticking. The
  // percentage drives proportional distribution; the pixel offset shifts the
  // whole curve so both reference widths land exactly on the design.
  //
  // Cloud 2 is the exception: its right edge is at -274 in Mobile Figma so
  // it's fully off-screen on mobile and pointless to render — `hidden sm:block`.
  // Its desktop formula uses the original 13% damped drift so it stays a
  // soft sliver at the left edge as the viewport widens past 1280.
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Cloud1
        className="absolute top-[calc(50%-421px)] w-[215px] h-[127px]"
        style={{left: 'calc(48.86% + 89.5px)'}}
      />

      <Cloud2
        className="hidden sm:block absolute top-[calc(50%-173px)] w-[236px] h-[118px]"
        style={{left: 'calc(-70px + (100% - 1280px) * 0.13)'}}
      />

      <Cloud3
        className="absolute top-[calc(50%-287px)] w-[272px] h-[91px]"
        style={{left: 'calc(43.18% - 337.7px)'}}
      />

      <Cloud4
        className="absolute top-[calc(50%-182px)] w-[215px] h-[127px] -scale-x-100"
        style={{right: 'calc(12.5% - 203.5px)'}}
      />
    </div>
  );
};

export default Background;
