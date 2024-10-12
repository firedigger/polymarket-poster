import { Axios } from 'axios';
import { analyzeMarketProfits, analyzeMarketProfit, calculatePartOfTheYear } from './helpers';

const client = new Axios({
    baseURL: "https://gamma-api.polymarket.com",
    headers: {
        'Content-Type': 'application/json'
    }
});
analyzeMarketProfits(client, 100815);
//analyzeMarketProfit(client, 509696).then(console.log);