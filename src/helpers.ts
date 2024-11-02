import { Axios } from 'axios';
import * as fs from 'fs';

export const myTags = [{ id: 96, label: 'Ukraine' }, { id: 100196, label: 'Fed rates' }, { id: 154, label: 'Middle East' }, { id: 131, label: 'Interest rates' }];
export const user_id = "0xBcBa8baE2E66da40fDc18C80064b06cF4F124573";
export const arr_threshold = 0.74;

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
        var t = tags.find((e: { label: string | string[]; }) => e.label?.includes('ukraine'));
        if (t) {
            break;
        }
        taglabels.push(...tags);
    } while (tags.length);
    taglabels.sort();
    fs.writeFileSync('tags.json', JSON.stringify(taglabels, null, 2));
}

export async function getRecentMarkets(client: Axios, tag_id: number): Promise<any[]> {
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
        const newMarkets = marketsPage.filter((m: { createdAt: string | number | Date; }) => new Date(m.createdAt) > twentyFourHoursAgo);
        if (newMarkets.length == 0) break;
        markets.push(...newMarkets);
    } while (marketsPage.length > 0);
    return markets;
}

export async function getClosingMarkets(client: Axios, tag_id: number | undefined = undefined, max_pages: number = 2): Promise<any[]> {
    let offset = 0;
    const markets = [];
    const stopWords = ['beat', 'say', 'match', 'combine', 'win', 'vs.', 'NFL', 'tweet'];
    let i = 0;
    do {
        var marketsPage = JSON.parse((await client.get('/markets', {
            params: {
                active: true,
                closed: false,
                tag_id: tag_id,
                offset: offset,
                order: 'endDate',
                ascending: true,
                end_date_min: new Date().toISOString()
            }
        })).data);
        offset += marketsPage.length;
        const newMarkets = marketsPage.filter((m: {
            question: string; endDate: string | number | Date;
        }) => stopWords.every(w => !m.question.includes(w)));
        if (newMarkets.length) {
            markets.push(...newMarkets);
            i++;
            if (i >= max_pages) break;
        }
    } while (marketsPage.length > 0);
    return markets;
}

async function getMarkets(client: Axios, tag_id: number): Promise<any[]> {
    let offset = 0;
    var markets = [];
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
        if (marketsPage.length == 0) break;
        markets.push(...marketsPage);
    } while (marketsPage.length > 0);
    return markets;
}

async function getMarket(client: Axios, market_id: number): Promise<any> {
    return JSON.parse((await client.get(`/markets/${market_id}`)).data);
}

export function calculatePartOfTheYear(deadline: Date): number {
    return Math.max(deadline.getTime() - Date.now(), 24 * 60 * 60 * 1000) / (Date.UTC(deadline.getUTCFullYear() + 1, 0, 1) - Date.UTC(deadline.getUTCFullYear(), 0, 1));
}

export async function analyzeMarketProfits(client: Axios, tag_id: number): Promise<void> {
    const markets = await getMarkets(client, tag_id);
    const threshold = 0.19;
    const profitMarkets = markets.map(m => ({ question: m.question, annualizedProfit: (1 / Math.max(m.bestAsk, 1 - m.bestBid) - 1) / calculatePartOfTheYear(new Date(m.endDate)) })).filter(m => m.annualizedProfit > threshold);
    profitMarkets.sort((a, b) => b.annualizedProfit - a.annualizedProfit);
    fs.writeFileSync("profitMarkets.txt", profitMarkets.map(m => `${m.question},${m.annualizedProfit}`).join('\n'));
}

export async function analyzeMarketProfit(client: Axios, market_id: number): Promise<number> {
    const market = await getMarket(client, market_id);
    const profit = (1 / Math.max(market.bestAsk, 1 - market.bestBid) - 1) / calculatePartOfTheYear(new Date(market.endDate));
    return profit;
}

export async function analyzeClosingMarketProfits(client: Axios): Promise<void> {
    const markets = await getClosingMarkets(client, undefined, 4);
    const threshold = 0.19;
    const profitMarkets = markets.map(m => ({ question: m.question, endDate: m.endDate, annualizedProfit: (1 / Math.max(m.bestAsk, 1 - m.bestBid) - 1) / calculatePartOfTheYear(new Date(m.endDate)) })).filter(m => m.annualizedProfit > threshold);
    profitMarkets.sort((a, b) => b.annualizedProfit - a.annualizedProfit);
    fs.writeFileSync("profitMarkets.txt", profitMarkets.map(m => `${m.question},${m.annualizedProfit},${m.endDate}`).join('\n'));
}

export function formatOutcome(outcome: string) {
    switch (outcome) {
        case 'Yes':
            return '🟢';
        case 'No':
            return '🔴';
        default:
            return outcome + "=";
    }
}

export async function getPositions(client: Axios, user_id: string): Promise<any[]> {
    return JSON.parse((await client.get(`https://data-api.polymarket.com/positions`, {
        params: {
            user: user_id
        }
    })).data);
}

async function getMarketsForConditionIds(client: Axios, condition_ids: string[]): Promise<any[]> { //TODO: expand to userscripts
    let fullMarkets = [];
    const batch = 20;
    for (let i = 0; i < condition_ids.length; i += batch) {
        const params = new URLSearchParams(condition_ids.slice(i, i + 20).map((id) => ['condition_ids', id]));
        const markets = JSON.parse((await client.get(`/markets`, {
            params: params
        })).data);
        fullMarkets.push(...markets);
    }
    return fullMarkets;
}

export async function getPositionsWithMarkets(client: Axios, user_id: string): Promise<any[]> {
    const positions = await getPositions(client, user_id);
    const uniqueConditionIds = Array.from(new Set(positions
        .sort((a, b) => b.currentValue - a.currentValue)
        .slice(0, 100)
        .map((p: { conditionId: string }) => p.conditionId)
    ));
    const markets = await getMarketsForConditionIds(client, uniqueConditionIds);
    return positions.map(p => {
        return { ...p, market: markets.find((m: { conditionId: string; }) => m.conditionId == p.conditionId) };
    }).filter(p => p.market).map(p => {
        return { ...p, bet: JSON.parse(p.market.outcomes)[0] === p.outcome, curPrice: p.outcome == JSON.parse(p.market.outcomes)[0] ? p.market.bestAsk : 1 - p.market.bestBid };
    });
}

export async function calculateCurrentBetsProfit(client: Axios, user_id: string): Promise<void> {
    const positions = await getPositions(client, user_id);
    const profitMarkets = positions.map((p: { curPrice: number; endDate: string | number | Date; title: any; }) => ({ question: p.title, annualizedProfit: (1 / p.curPrice - 1) / calculatePartOfTheYear(new Date(p.endDate)) }));
    profitMarkets.sort((a, b) => a.annualizedProfit - b.annualizedProfit);
    fs.writeFileSync("profitMarkets.txt", profitMarkets.map(m => `${m.question},${m.annualizedProfit}`).join('\n'));
}

export async function calculateCheaperPositions(client: Axios, user_id: string): Promise<void> {
    const positions = await getPositions(client, user_id);
    const markets: any[] = JSON.parse((await client.get(`/markets`, {
        params: new URLSearchParams(positions.map((p: { conditionId: string }) => ['condition_ids', p.conditionId]))
    })).data);
    const cheaperPositions = positions.map(p => {
        return { ...p, market: markets.find((m: { conditionId: string; }) => m.conditionId == p.conditionId) };
    }).filter(p => p.market).map((p: { avgPrice: number; conditionId: string; question: string; outcome: string, market: any; title: string }) => {
        const firstOutcome = JSON.parse(p.market.outcomes)[0];
        const newPrice = p.outcome == firstOutcome ? p.market.bestAsk : 1 - p.market.bestBid;
        const priceReduced = p.market.oneDayPriceChange && ((p.outcome == firstOutcome) == (p.market.oneDayPriceChange < 0));
        return { ...p, newPrice, priceReduced };
    }).filter(p => p.newPrice < p.avgPrice && p.priceReduced);
    fs.writeFileSync("cheaperPositions.txt", cheaperPositions.map(m => `${m.title} is cheaper by ${Math.round((m.avgPrice - m.newPrice) / m.avgPrice * 100)}%`).join('\n'));
}