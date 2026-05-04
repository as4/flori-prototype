import Cloud1 from '../../assets/cloud-1.svg?react';
import Cloud2 from '../../assets/cloud-2.svg?react';
import Cloud3 from '../../assets/cloud-3.svg?react';
import Cloud4 from '../../assets/cloud-4.svg?react';

////////////////////////////////////////////////////////////////////////////////

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
const Background = () => (
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

export default Background;
