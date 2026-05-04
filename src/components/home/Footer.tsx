import PttButton from './PttButton';

////////////////////////////////////////////////////////////////////////////////

const Footer = () => (
  <footer className="absolute right-0 bottom-6 sm:bottom-12 left-0 z-10 flex flex-col items-center gap-4">
    <PttButton/>
    <div className="text-sm leading-5 text-center text-black/30">
      Hold <span className="hidden sm:inline">Space </span>to speak
    </div>
  </footer>
);

export default Footer;
