import { Axios } from 'axios';
import { analyzeMarketProfits, analyzeMarketProfit, calculatePartOfTheYear, calculateCurrentBetsProfit, analyzeClosingMarketProfits, calculateCheaperPositions } from './helpers';

const client = new Axios({
    baseURL: "https://gamma-api.polymarket.com",
    headers: {
        'Content-Type': 'application/json'
    }
});
//analyzeMarketProfits(client, 100164);
//analyzeClosingMarketProfits(client);
//analyzeMarketProfit(client, 503013).then(console.log);
//calculateCurrentBetsProfit(client, "0xBcBa8baE2E66da40fDc18C80064b06cF4F124573");
calculateCheaperPositions(client, "0xBcBa8baE2E66da40fDc18C80064b06cF4F124573");