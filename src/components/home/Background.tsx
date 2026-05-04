import Cloud1 from '../../assets/cloud-1.svg?react';
import Cloud2 from '../../assets/cloud-2.svg?react';
import Cloud3 from '../../assets/cloud-3.svg?react';
import Cloud4 from '../../assets/cloud-4.svg?react';

////////////////////////////////////////////////////////////////////////////////

// Cloud vertical offsets are anchored to the viewport centre (50%) rather
// than the top, so that at the Figma 1280×800 reference the absolute top
// values match exactly while taller viewports push the clouds down with
// the centred character instead of leaving empty pink at the bottom.
const Background = () => (
  <div className="absolute inset-0 pointer-events-none">
    <Cloud1 className="absolute top-[calc(50%-421px)] left-[calc(50%+75px)] w-[215px] h-[127px]"/>
    <Cloud2 className="absolute top-[calc(50%-173px)] left-[calc(50%-710px)] w-[236px] h-[118px]"/>
    <Cloud3 className="absolute top-[calc(50%-287px)] left-[calc(50%-425px)] w-[272px] h-[91px]"/>
    <Cloud4 className="absolute top-[calc(50%-182px)] left-[calc(50%+468px)] w-[215px] h-[127px] -scale-x-100"/>
  </div>
);

export default Background;
