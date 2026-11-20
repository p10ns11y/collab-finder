export const uiSdkFlag = (): boolean => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('ui-sdk') === '1';
};
