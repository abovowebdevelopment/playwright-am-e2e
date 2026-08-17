import { testThemeAssetsLoad } from '../dist/suites/abovo-basis';

// Listed, never executed — see registration.config.ts.
testThemeAssetsLoad({
  assets: [
    {
      label: 'critical css',
      filename: 'critical.css',
      domSelector: 'link[rel="stylesheet"][href]',
      urlAttribute: 'href',
    },
  ],
});
