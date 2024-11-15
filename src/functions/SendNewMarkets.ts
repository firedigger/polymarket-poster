import { app, InvocationContext } from "@azure/functions";
import { Axios } from 'axios';
import * as fs from 'fs';
import TelegramBot from 'node-telegram-bot-api';
import { formatOutcome, getRecentMarkets, myTags } from "../helpers";

async function sendNewMarkets(myTimer: any, context: InvocationContext, toTarget: boolean = true): Promise<void> {
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
    const tags = myTags;
    const lines = [];
    const set = new Set();
    for (const tag of tags) {
        const newLines: string[] = [];
        const markets = await getRecentMarkets(client, tag.id);
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
        const chatId = process.env.AZURE_FUNCTIONS_ENVIRONMENT === 'Development' || !toTarget ? REPORT_CHAT_ID : '346672381';
        await bot.sendMessage(chatId, message);
        context.log('New markets sent');
    }
}


app.timer('SendNewMarkets', {
    schedule: '0 0 6 * * *',
    handler: sendNewMarkets
});

app.http('ManualSendNewMarkets', {
    methods: ["POST"],
    authLevel: "function",
    handler: async (request, context) => {
        await sendNewMarkets(undefined, context, false);
        return {
            status: 200,
            body: "OK"
        };
    }
});