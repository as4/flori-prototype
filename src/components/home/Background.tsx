////////////////////////////////////////////////////////////////////////////////

// Cloud vertical offsets are anchored to the viewport centre (50%) rather
// than the top, so that at the Figma 1280×800 reference the absolute top
// values match exactly while taller viewports push the clouds down with
// the centred character instead of leaving empty pink at the bottom.
const Background = () => (
  <div className="absolute inset-0 pointer-events-none">
    <img className="absolute top-[calc(50%-421px)] left-[calc(50%+75px)] w-[215px] h-[127px]" src="/assets/cloud-1.svg" alt=""/>
    <img className="absolute top-[calc(50%-173px)] left-[calc(50%-710px)] w-[236px] h-[118px]" src="/assets/cloud-2.svg" alt=""/>
    <img className="absolute top-[calc(50%-287px)] left-[calc(50%-425px)] w-[272px] h-[91px]" src="/assets/cloud-3.svg" alt=""/>
    <img className="absolute top-[calc(50%-182px)] left-[calc(50%+468px)] w-[215px] h-[127px] -scale-x-100" src="/assets/cloud-4.svg" alt=""/>
  </div>
);

export default Background;
