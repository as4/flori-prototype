import { useState, useEffect } from 'react';

////////////////////////////////////////////////////////////////////////////////

const useLocalStorage = (key: string, defaultValue = '') => {
  const [value, setValue] = useState(
    () => localStorage.getItem(key) ?? defaultValue
  );

  useEffect(
    () => {
      localStorage.setItem(key, value);
    },
    [key, value]
  );

  return [value, setValue] as const;
};

export default useLocalStorage;
