import Pill from './Pill';

////////////////////////////////////////////////////////////////////////////////

const Footer = () => (
  <footer className="absolute right-0 bottom-6 left-0 z-10 flex flex-col items-center gap-4 sm:bottom-12">
    <Pill className="w-[72px] h-[72px] flex items-center justify-center gap-1">
      <span className="block w-[2.5px] h-2 bg-black rounded-full"/>
      <span className="block w-[2.5px] h-4 bg-black rounded-full"/>
      <span className="block w-[2.5px] h-8 bg-black rounded-full"/>
      <span className="block w-[2.5px] h-3 bg-black rounded-full"/>
      <span className="block w-[2.5px] h-5 bg-black rounded-full"/>
      <span className="block w-[2.5px] h-2 bg-black rounded-full"/>
    </Pill>
    <div className="text-sm leading-5 text-center text-black/30">
      Hold <span className="hidden sm:inline">Space </span>to speak
    </div>
  </footer>
);

export default Footer;
