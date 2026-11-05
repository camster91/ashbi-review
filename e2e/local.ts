import { test as base,expect } from '@playwright/test';
export const localHeaders={authorization:'Bearer local-e2e-test-only-key-at-least-32-characters'};
export const test=base.extend({context:async({context},use)=>{
 await context.route('http://127.0.0.1:8788/api/**',route=>route.continue({headers:{...route.request().headers(),...localHeaders}}));
 await use(context);
}});
export {expect};
