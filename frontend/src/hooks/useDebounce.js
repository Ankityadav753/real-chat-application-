import { useState, useEffect } from 'react';

/**
 * Custom hook to debounce updates to a value.
 * @param {*} value - The input value to debounce
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {*} The debounced value
 */
export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
export default useDebounce;
