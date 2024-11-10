import { app, InvocationContext, output } from "@azure/functions";
import { Axios } from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import { arr_threshold, calculatePartOfTheYear, getPositionsWithMarkets, getProfit, user_id } from "../helpers";

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

const tableOutput = process.env.FUNCTIONS_WORKER_RUNTIME ? output.table({
    tableName: 'Profits',
    connection: 'AzureWebJobsStorage'
}) : undefined;

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
    const positions = (await getPositionsWithMarkets(client, user_id)).map(p => ({ ...p, question: `${p.title}${formatOutcome(p.outcome)}`, dailyMove: (p.market.oneDayPriceChange || 0) * (p.bet ? 1 : -1), annualizedProfit: (1 / p.curPrice - 1) / calculatePartOfTheYear(new Date(p.endDate)) })).sort((a, b) => b.annualizedProfit - a.annualizedProfit);
    const total = positions.reduce((acc, p) => acc + p.currentValue, 0);
    const dailyChange = positions.reduce((acc, p) => acc + p.dailyMove * p.size, 0);
    const profit = await getProfit(client, user_id);
    const unrealizedProfit = positions.reduce((acc, p) => acc + p.cashPnl, 0);
    message += `Your current profit is ${moneyFormatter.format(profit)}$ ($${moneyFormatter.format(unrealizedProfit)})\n`;
    if (tableOutput)
        context.extraOutputs.set(tableOutput, {
            PartitionKey: 'Profit',
            RowKey: new Date().toISOString(),
            Profit: profit,
            UnrealizedProfit: unrealizedProfit
        });
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
    const eventSizesByMarket: Map<string, number> = positions.reduce((map, item): any => {
        const currentSize = map.get(item.market.id) || 0;
        map.set(item.market.id, currentSize + item.size * (item.bet ? 1 : -1));
        return map;
    }, new Map<string, number>());
    const dailyMoveMarkets = positions.filter(p => Math.abs(p.dailyMove) > 0.01).map(p => ({ ...p, size: Math.abs(eventSizesByMarket.get(p.market.id) || 0) })).sort((a, b) => Math.abs(b.dailyMove * b.size) - Math.abs(a.dailyMove * a.size)).slice(0, 3);
    if (dailyMoveMarkets.length) {
        dailyMoveMarkets.forEach(m => markets.add(m.market.id));
        message += `<b>Markets with the biggest daily moves:</b>\n` + dailyMoveMarkets.map(m => `${m.question} ${moneyFormatter.format(m.dailyMove * 100)}¢(${moneyFormatter.format(m.dailyMove * m.size)}$)\n`).join('');
    }
    const positionsForClosing = positions.map(p => ({ ...p, curPrice: p.bet ? p.market.bestBid : 1 - p.market.bestAsk, annualizedProfit: (1 / (p.bet ? p.market.bestBid : 1 - p.market.bestAsk) - 1) / calculatePartOfTheYear(new Date(p.endDate)) })).filter(p => p.annualizedProfit < arr_threshold).reverse();
    if (positionsForClosing.length) {
        positionsForClosing.forEach(m => markets.add(m.market.id));
        message += `<b>Positions for closing as per ARR:</b>\n` + positionsForClosing.filter(m => m.curPrice).map(m => `${m.question} ${probabilityFormatter.format(m.curPrice * 100)}¢ (${probabilityFormatter.format(m.annualizedProfit * 100)}%)\n`).join('');
    }
    const profitableUnlikelyBets = positions.filter(p => p.avgPrice < 0.5 && p.curPrice <= 0.5 && p.avgPrice < (p.bet ? p.market.bestBid : 1 - p.market.bestAsk) && p.size > 2).sort((a, b) => a.avgPrice - b.avgPrice);
    if (profitableUnlikelyBets.length) {
        profitableUnlikelyBets.forEach(m => markets.add(m.market.id));
        message += `<b>Unlikely bets for closing with profit:</b>\n` + profitableUnlikelyBets.map(m => `${m.question} (${probabilityFormatter.format(m.avgPrice * 100)}¢ -> ${probabilityFormatter.format(m.curPrice * 100)}¢)\n`).join('');
    }
    const cheaperSureBets = positions.filter(p => p.curPrice >= 0.7 && p.avgPrice - p.curPrice > 0.01 && p.size > 2 && p.market.oneDayPriceChange < 0 !== p.bet && p.annualizedProfit > arr_threshold && !markets.has(p.market.id)).slice(0, 4);
    if (cheaperSureBets.length) {
        cheaperSureBets.forEach(m => markets.add(m.market.id));
        message += `<b>Cheaper confident bets:</b>\n` + cheaperSureBets.map(m => `${m.question} ${probabilityFormatter.format(m.annualizedProfit * 100)}% ARR (${probabilityFormatter.format(m.avgPrice * 100)}¢ -> ${probabilityFormatter.format(m.curPrice * 100)}¢)\n`).join('');
    }
    const risingBets = positions.filter(p => p.curPrice > p.avgPrice && p.curPrice < 0.99 && p.size < 50 && p.curPrice > 0.5 && p.annualizedProfit > 1 && !markets.has(p.market.id)).slice(0, 5);
    if (risingBets.length) {
        risingBets.forEach(m => markets.add(m.market.id));
        message += `<b>Rising bets to add funds:</b>\n` + risingBets.map(m => `${m.question} ${probabilityFormatter.format(m.annualizedProfit * 100)}% ARR (${probabilityFormatter.format(m.avgPrice * 100)}¢ -> ${probabilityFormatter.format(m.curPrice * 100)}¢)\n`).join('');
    }
    const eventSizesbyNegMarket: Map<string, number> = positions.reduce((map, item): any => {
        if (!item.market.negRiskMarketID)
            return map;
        const currentSize = map.get(item.market.negRiskMarketID) || 0;
        map.set(item.market.negRiskMarketID, currentSize + item.size);
        return map;
    }, new Map<string, number>());
    const betOfTheDay = positions.filter(p => p.curPrice >= 0.56 && p.curPrice < 0.99 && p.initialValue > 2 && p.size < 50 && p.annualizedProfit > 1 && (!p.market.negRiskMarketID || (eventSizesbyNegMarket.get(p.market.negRiskMarketID) || 0) < 50) && !markets.has(p.market.id)).slice(0, 3);
    if (betOfTheDay.length) {
        message += `<b>Bets of the day:<b>\n` + betOfTheDay.map(m => `${m.question} ${probabilityFormatter.format(m.curPrice * 100)}¢\n`).join('');
    }

    if (process.env.FUNCTIONS_WORKER_RUNTIME) {
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_KEY!, { polling: false });
        await bot.sendMessage('44284808', message);
    } else {
        console.log(message);
    }
}

if (process.env.FUNCTIONS_WORKER_RUNTIME)
    app.timer('SendStatusUpdate', {
        schedule: '0 0 7 * * *',
        handler: sendStatusUpdates,
        extraOutputs: [tableOutput!]
    });