/**
 * This auth is going to use the Authorization Code flow, described in the docs:
 * https://developers.google.com/actions/identity/oauth2-code-flow
 */
import * as express from 'express';
import { Headers } from 'actions-on-google';
/**
 * A function that gets the user id from an access token.
 * Replace this functionality with your own OAuth provider.
 *
 * @param headers HTTP request headers
 * @return The user id
 */
export declare function getUser(headers: Headers): Promise<string>;
/**
 * A function that adds /login, /fakeauth, /faketoken endpoints to an
 * Express server. Replace this with your own OAuth endpoints.
 *
 * @param expressApp Express app
 */
export declare function registerAuthEndpoints(expressApp: express.Express): Promise<void>;
