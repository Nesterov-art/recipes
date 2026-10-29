import type { Translate } from '../constants/i18n.ts';
import { checkRecipeUrl, type PageFetchResult } from './fetch-recipe-page.ts';
import type { ImportProblem, RecipeImportResult } from './recipe-import.ts';
import { parseRecipeLink, RecipeLinkError, type SharedRecipe } from './recipe-link.ts';

// What a pasted text on "Add from link" is: a Monorec link (read locally, as before), the
// address of a cooking site's page (loaded), or neither. A Monorec link is recognised by its
// data, never by the host name, and is never sent to the network loader.
export type LinkTarget =
  | { kind: 'monorec'; recipe: SharedRecipe }
  | { kind: 'monorecError'; code: RecipeLinkError['code'] }
  | { kind: 'site'; url: string }
  | { kind: 'refused'; result: Extract<PageFetchResult, { status: 'invalidUrl' | 'blockedUrl' }> }
  // An address on Monorec's own host that is not a recipe link: not loaded.
  | { kind: 'ownPage' }
  | { kind: 'notLink' };

// A token that is meant as an address: a scheme with "//", a scheme that has no host, or a
// name with a dot and a top-level domain ("eda.ru/recepty", missing https://).
const ADDRESS = /^(?:[a-z][a-z\d+.-]*:\/\/|(?:javascript|data|file|blob|about|mailto):|[^\s/?#]+\.[a-zа-яё]{2,}(?:[/?#:]|$))/i;
const hostOf = (text: string) => { try { return new URL(text).hostname.toLowerCase().replace(/\.$/, ''); } catch { return null; } };

// ownHosts: the exact host names of Monorec itself (the share origin, and on the web the page's host).
export function linkTarget(text: string, ownHosts: string[]): LinkTarget {
  try {
    return { kind: 'monorec', recipe: parseRecipeLink(text) };
  } catch (error) {
    if (!(error instanceof RecipeLinkError)) return { kind: 'monorecError', code: 'invalid' };
    if (error.code !== 'missing') return { kind: 'monorecError', code: error.code };
  }
  const addresses = text.trim().split(/\s+/).filter(token => ADDRESS.test(token));
  if (addresses.length !== 1) return { kind: 'notLink' };
  const host = hostOf(addresses[0]);
  if (host && ownHosts.some(own => own.toLowerCase().replace(/\.$/, '') === host)) return { kind: 'ownPage' };
  const checked = checkRecipeUrl(addresses[0]);
  if (checked.ok) return { kind: 'site', url: checked.url };
  return { kind: 'refused', result: checked.status === 'invalidUrl' ? { status: 'invalidUrl' } : { status: 'blockedUrl', reason: checked.reason, redirect: false } };
}

// --- Messages: a translation key and its values for each outcome ------------------------------

export type Message = { key: Parameters<Translate>[0]; values?: Record<string, string | number> };

// web: the page runs in a browser, where a refused cross-site request looks like a network
// failure; the message says it may be that, without claiming it.
export function loadMessage(result: Exclude<PageFetchResult, { status: 'success' }>, web: boolean): Message {
  switch (result.status) {
    case 'invalidUrl': return { key: 'siteErrorInvalidUrl' };
    case 'blockedUrl': return { key: result.reason === 'scheme' ? 'siteErrorScheme' : result.redirect ? 'siteErrorBlockedRedirect' : 'siteErrorBlocked' };
    case 'tooManyRedirects': return { key: 'siteErrorRedirects' };
    case 'httpError':
      if (result.kind === 'denied') return { key: 'siteErrorDenied' };
      if (result.kind === 'notFound') return { key: 'siteErrorNotFound' };
      if (result.kind === 'rateLimited') return { key: 'siteErrorRateLimited' };
      return { key: 'siteErrorServer', values: { status: result.httpStatus } };
    case 'unsupportedContentType': return { key: 'siteErrorNotHtml' };
    case 'empty': return { key: 'siteErrorEmpty' };
    case 'tooLarge': return { key: 'siteErrorTooLarge' };
    case 'timeout': return { key: 'siteErrorTimeout' };
    case 'cancelled': return { key: 'siteCancelled' };
    case 'networkError': return { key: web && result.stage === 'request' ? 'siteErrorNetworkWeb' : 'siteErrorNetwork' };
    case 'unsupportedEncoding': return { key: 'siteErrorEncoding', values: { encoding: result.encoding } };
    case 'invalidEncoding': return { key: 'siteErrorDamagedText' };
  }
}

export function parseMessage(result: Extract<RecipeImportResult, { status: 'noRecipe' | 'invalidData' | 'unsupported' }>): Message {
  if (result.status === 'noRecipe') return { key: 'siteErrorNoRecipe' };
  if (result.status === 'invalidData') return { key: 'siteErrorBadData' };
  return { key: result.reason === 'recipeTooLarge' ? 'siteErrorRecipeTooLarge' : 'siteErrorDataTooLarge' };
}

// One line per problem of a partial result, as shown above the preview.
export function problemMessage(problem: ImportProblem): Message {
  if (problem.field === 'time') {
    if (problem.problem === 'mayIncludeWaiting') return { key: 'siteProblemTimeWaiting', values: { minutes: problem.activeMinutes } };
    if (problem.problem === 'onlyPart') return { key: problem.part === 'prepTime' ? 'siteProblemTimePrepOnly' : 'siteProblemTimeCookOnly' };
    if (problem.problem === 'missing') return { key: 'siteProblemTimeMissing' };
    if (problem.problem === 'zero') return { key: 'siteProblemTimeZero' };
    // invalid, notWholeMinutes, outOfRange, conflicting: the page's time is not taken.
    return { key: 'siteProblemTimeUnclear' };
  }
  if (problem.field === 'category') return { key: problem.problem === 'ambiguous' ? 'siteProblemCategoryAmbiguous' : 'siteProblemCategoryMissing' };
  if (problem.problem !== 'missing') return { key: 'siteErrorRecipeTooLarge' };
  return { key: problem.field === 'title' ? 'siteProblemTitleMissing' : problem.field === 'ingredients' ? 'siteProblemIngredientsMissing' : 'siteProblemStepsMissing' };
}
