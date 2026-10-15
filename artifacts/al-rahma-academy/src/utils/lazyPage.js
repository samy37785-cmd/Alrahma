import { lazy, createElement } from 'react';

// React.lazy() plus preload() (#250). A lazy page always suspends on its first
// render, even when its chunk is already downloaded, so the app used to show
// the Suspense spinner in place of the prerendered content for a moment at
// startup. Once preload() has resolved, the page renders synchronously.
export function lazyPage(factory) {
  let Loaded = null;
  let promise = null;
  const preload = () => {
    promise ??= factory().then(
      (module) => {
        Loaded = module.default;
        return module;
      },
      (error) => {
        promise = null; // allow a retry, as React.lazy would on the next render
        throw error;
      }
    );
    return promise;
  };
  const Lazy = lazy(preload);
  function Page(props) {
    return createElement(Loaded ?? Lazy, props);
  }
  Page.preload = preload;
  return Page;
}
