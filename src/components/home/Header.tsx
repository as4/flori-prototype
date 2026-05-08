import React from 'react';
import Pill from './Pill';
import {cn} from '../../utils/cn';
import LogoLeaf from '../../assets/logo-leaf.svg?react';
import IconMute from '../../assets/icon-mute.svg?react';
import IconSettings from '../../assets/icon-settings.svg?react';
import IconCloseSidebar from '../../assets/icon-close-sidebar.svg?react';

////////////////////////////////////////////////////////////////////////////////

type Props = {
  muted?: boolean;
  settingsOpen?: boolean;
  onMuteClick?: () => void;
  onSettingsClick?: () => void;
};

const Header: React.FC<Props> = ({muted, settingsOpen, onMuteClick, onSettingsClick}) => (
  <header className="absolute top-6 sm:top-12 right-6 sm:right-12 left-6 sm:left-12 z-10 flex items-center justify-between">
    <Pill className="h-12 px-4 flex items-center gap-2 font-semibold text-base text-black">
      <LogoLeaf className="w-4 h-4"/>
      <span>Flori</span>
    </Pill>

    <div className="flex items-center gap-3 sm:gap-4">
      <Pill
        className={cn(
          'w-12 h-12 flex items-center justify-center',
          'transition-colors duration-300',
          muted && 'from-[#FF5A7D] to-[#FF5A7D] border-transparent'
        )}
        onClick={onMuteClick}
      >
        <IconMute
          className={cn(
            'w-6 h-6',
            '[&_path]:transition-colors [&_path]:duration-300',
            muted && '[&_path]:fill-white'
          )}
          title={muted ? 'Unmute' : 'Mute'}
        />
      </Pill>
      <Pill
        className="w-12 h-12 flex items-center justify-center"
        onClick={onSettingsClick}
      >
        {
          settingsOpen ?
            <IconCloseSidebar className="w-6 h-6" title="Close settings"/>
            :
            <IconSettings className="w-6 h-6" title="Settings"/>
        }
      </Pill>
    </div>
  </header>
);

export default Header;
