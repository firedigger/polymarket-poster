import { app, InvocationContext } from "@azure/functions";
import { Axios } from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import { arr_threshold, calculatePartOfTheYear, getPositionsWithMarkets, user_id } from "../helpers";

function formatOutcome(outcome: string) {
    switch (outcome) {
        case 'Yes':
            return '🟢';
        case 'No':
            return '🔴';
        default:
            return `(${outcome})`;
    }
}

export async function sendStatusUpdates(myTimer: any, context: InvocationContext, toTarget: boolean = true): Promise<void> {
    const moneyFormatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
        signDisplay: "always",
    });
    const probabilityFormatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
    });
    const client = new Axios({
        baseURL: "https://gamma-api.polymarket.com",
        headers: {
            'Content-Type': 'application/json'
        }
    });
    let message = "Welcome to today's status update!\n";
    const positions = (await getPositionsWithMarkets(client, user_id)).map(p => ({ ...p, question: `${p.title}${formatOutcome(p.outcome)}`, dailyMove: p.market.oneDayPriceChange * (p.bet ? 1 : -1), annualizedProfit: (1 / p.curPrice - 1) / calculatePartOfTheYear(new Date(p.endDate)) })).sort((a, b) => b.annualizedProfit - a.annualizedProfit);
    const total = positions.reduce((acc, p) => acc + p.currentValue, 0);
    const dailyChange = positions.reduce((acc, p) => acc + (p.market.oneDayPriceChange || 0) * (p.bet ? 1 : -1) * p.size, 0);
    message += `Your daily performance is ${moneyFormatter.format(dailyChange)}$(${moneyFormatter.format(dailyChange / total * 100)}%)\n`;
    message += `Percent of profitable bets: ${probabilityFormatter.format(positions.filter(p => p.curPrice >= p.avgPrice).length / positions.length * 100)}%\n`;
    message += `Percent of profitable bets volume: ${probabilityFormatter.format(positions.filter(p => p.curPrice >= p.avgPrice).reduce((acc, p) => acc + p.initialValue, 0) / positions.reduce((acc, p) => acc + p.initialValue, 0) * 100)}%\n`;
    const positionsForDeadlines = positions.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
    const totalSize = positions.reduce((acc, p) => acc + p.size, 0);
    let acc = 0;
    for (let i = 0; i < positionsForDeadlines.length; i++) {
        acc += positionsForDeadlines[i].size;
        if (acc * 2 > totalSize) {
            message += `Most of your funds will be decided by ${new Date(positionsForDeadlines[i].endDate).toLocaleDateString('fi-FI')}\n`;
            break;
        }
    }
    const markets = new Set();
    const dailyMoveMarkets = positions.filter(p => Math.abs(p.dailyMove) > 0.01 && !markets.has(p.market.id)).sort((a, b) => Math.abs(b.dailyMove * b.size) - Math.abs(a.dailyMove * a.size)).slice(0, 3);
    if (dailyMoveMarkets.length) {
        dailyMoveMarkets.forEach(m => markets.add(m.market.id));
        message += `Markets with the biggest daily moves:\n` + dailyMoveMarkets.map(m => `${m.question} ${moneyFormatter.format(m.dailyMove * 100)}¢(${moneyFormatter.format(m.dailyMove * m.size)}$)\n`).join('');
    }
    const profitMarkets = positions.map(p => ({ ...p, annualizedProfit: (1 / (p.bet ? p.market.bestBid : 1 - p.market.bestAsk) - 1) / calculatePartOfTheYear(new Date(p.endDate)) })).filter(p => p.annualizedProfit < arr_threshold).reverse();
    if (profitMarkets.length) {
        profitMarkets.forEach(m => markets.add(m.market.id));
        message += `Positions for closing:\n` + profitMarkets.map(m => `${m.question} ${probabilityFormatter.format(m.annualizedProfit * 100)}%\n`).join('');
    }
    const cheaperSureBets = positions.filter(p => p.curPrice >= 0.7 && p.avgPrice - p.curPrice > 0.01 && p.size > 2 && p.market.oneDayPriceChange < 0 !== p.bet && p.annualizedProfit > arr_threshold && !markets.has(p.market.id)).slice(0, 4);
    if (cheaperSureBets.length) {
        cheaperSureBets.forEach(m => markets.add(m.market.id));
        message += `Cheaper confident bets:\n` + cheaperSureBets.map(m => `${m.question} ${probabilityFormatter.format(m.annualizedProfit * 100)}% ARR (${probabilityFormatter.format(m.avgPrice * 100)}¢ -> ${probabilityFormatter.format(m.curPrice * 100)}¢)\n`).join('');
    }
    const risingBets = positions.filter(p => p.curPrice > p.avgPrice && p.size < 50 && p.curPrice > 0.5 && p.annualizedProfit > 1 && !markets.has(p.market.id)).slice(0, 5);
    if (risingBets.length) {
        risingBets.forEach(m => markets.add(m.market.id));
        message += `Rising bets to add funds:\n` + risingBets.map(m => `${m.question} ${probabilityFormatter.format(m.annualizedProfit * 100)}% ARR (${probabilityFormatter.format(m.avgPrice * 100)}¢ -> ${probabilityFormatter.format(m.curPrice * 100)}¢)\n`).join('');
    }
    const eventSizes: Map<string, number> = positions.reduce((map, item): any => {
        if (!item.market.negRiskMarketID)
            return map;
        const currentSize = map.get(item.market.negRiskMarketID) || 0;
        map.set(item.market.negRiskMarketID, currentSize + item.size);
        return map;
    }, new Map<string, number>());
    const betOfTheDay = positions.filter(p => p.curPrice >= 0.56 && p.size > 3 && p.size < 50 && p.annualizedProfit > 1 && (!p.market.negRiskMarketID || (eventSizes.get(p.market.negRiskMarketID) || 0) < 50) && !markets.has(p.market.id)).slice(0, 3);
    if (betOfTheDay.length) {
        message += `Bets of the day:\n` + betOfTheDay.map(m => `${m.question} ${probabilityFormatter.format(m.curPrice * 100)}¢\n`).join('');
    }

    if (process.env.FUNCTIONS_WORKER_RUNTIME) {
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_KEY!, { polling: false });
        await bot.sendMessage('44284808', message);
    } else {
        console.log(message);
    }
}

app.timer('SendStatusUpdate', {
    schedule: '0 0 7 * * *',
    handler: sendStatusUpdates
});