import Pill from './Pill';
import LogoLeaf from '../../assets/logo-leaf.svg?react';
import IconMute from '../../assets/icon-mute.svg?react';
import IconSettings from '../../assets/icon-settings.svg?react';

////////////////////////////////////////////////////////////////////////////////

const Header = () => (
  <header className="absolute top-6 right-6 left-6 z-10 flex items-center justify-between sm:top-12 sm:right-12 sm:left-12">
    <Pill className="flex items-center gap-2 h-12 px-4 font-semibold text-base text-black">
      <LogoLeaf className="w-4 h-4"/>
      <span>Flori</span>
    </Pill>

    <div className="flex items-center gap-3 sm:gap-4">
      <Pill className="w-12 h-12 flex items-center justify-center">
        <IconMute className="w-6 h-6" title="Mute"/>
      </Pill>
      <Pill className="w-12 h-12 flex items-center justify-center">
        <IconSettings className="w-6 h-6" title="Settings"/>
      </Pill>
    </div>
  </header>
);

export default Header;
