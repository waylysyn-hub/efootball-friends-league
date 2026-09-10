import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',
 timeout:30000,
 fullyParallel:true,
 workers:process.env.CI ? 2 : undefined,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://localhost:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'npm run dev:qa',url:'http://localhost:4173',reuseExistingServer:!process.env.CI},
 projects:[1920,1366,1024,768,430,390,360].map(width=>({name:width+'px',use:{viewport:{width,height:width===1920?1080:width>=768?768:844}}})),
});
