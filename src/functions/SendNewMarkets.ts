import { app, InvocationContext, Timer } from "@azure/functions";
import { Axios } from 'axios';
import * as fs from 'fs';
import TelegramBot from 'node-telegram-bot-api';

async function getTags(client: Axios): Promise<void> {
    let count = 0;
    var taglabels = [];
    do {
        var tags = JSON.parse((await client.get('/tags', {
            params: {
                offset: count
            }
        })).data);
        count += tags.length;
        var t = tags.find(e => e.label?.includes('ukraine'));
        if (t) {
            break;
        }
        taglabels.push(...tags);
    } while (tags.length);
    taglabels.sort();
    fs.writeFileSync('tags.json', JSON.stringify(taglabels, null, 2));
}

async function getMarkets(client: Axios, tag_id: number): Promise<any[]> {
    let offset = 0;
    var markets = [];
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    do {
        var marketsPage = JSON.parse((await client.get('/markets', {
            params: {
                active: true,
                closed: false,
                tag_id: tag_id,
                offset: offset,
                order: 'createdAt',
                ascending: false
            }
        })).data);
        offset += marketsPage.length;
        const newMarkets = marketsPage.filter(m => new Date(m.createdAt) > twentyFourHoursAgo);
        if (newMarkets.length == 0) break;
        markets.push(...newMarkets);
    } while (marketsPage.length > 0);
    return markets;
}


function formatOutcome(outcome: string) {
    switch (outcome) {
        case 'Yes':
            return '🟢';
        case 'No':
            return '🔴';
        default:
            return outcome + "=";
    }
}

export async function sendNewMarkets(myTimer: Timer, context: InvocationContext): Promise<void> {
    const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
    });
    const client = new Axios({
        baseURL: "https://gamma-api.polymarket.com",
        headers: {
            'Content-Type': 'application/json'
        }
    });
    const tags = [{ id: 96, label: 'Ukraine' }, { id: 100196, label: 'Fed rates' }, { id: 154, label: 'Middle East' }, { id: 131, label: 'Interest rates' }];
    const lines = [];
    const set = new Set();
    for (const tag of tags) {
        const newLines = [];
        const markets = await getMarkets(client, tag.id);
        markets.forEach(m => {
            if (set.has(m.id)) return;
            set.add(m.id);
            const outcomes = JSON.parse(m.outcomes);
            let str = `${m.question} ${formatOutcome(outcomes[0])}${formatter.format(m.bestAsk * 100)} ${formatOutcome(outcomes[1])}${formatter.format(100 - m.bestBid * 100)}`;
            if (m.oneDayPriceChange)
                str += ` ${m.oneDayPriceChange > 0 ? '📈' : '📉'} ${formatter.format(100 * m.oneDayPriceChange)}`;
            newLines.push(str);
        });
        if (newLines.length) {
            lines.push(tag.label);
            lines.push(...newLines);
        }
    }
    if (lines.length) {
        var message = "Приветствую! Новые ставки по выбранным тэгам:\n" + lines.join('\n');
        if (process.env.AZURE_FUNCTIONS_ENVIRONMENT === 'Development')
            fs.writeFileSync('markets.txt', message);
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_KEY!, { polling: false });
        const REPORT_CHAT_ID = '44284808';
        const chatId = process.env.AZURE_FUNCTIONS_ENVIRONMENT === 'Development' ? REPORT_CHAT_ID : '346672381';
        await bot.sendMessage(chatId, message);
    }
}

app.timer('SendNewMarkets', {
    schedule: '0 0 6 * * *',
    handler: sendNewMarkets
});
