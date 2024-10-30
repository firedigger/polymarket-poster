# polymarket-poster
This is my personal project of a polymarket updates poster through telegram deployed as an azure function. It sends new markets by a set of tags, and updates of the portfolio with some mathematical calculation for opportunities to add funds. The output is formated for compactness.  
Example output:
```
Welcome to today's status update!
Your daily performance is +7.3$(+1%)
Percent of profitable bets: 48.7%
Percent of profitable bets volume: 52.3%
Most of your funds will be decided by 5.11.2024
Markets with the biggest daily moves:
Who will win white women?(Harris) +8¢(+2.2$)
Will either Kamala or Trump win every swing state?🔴 +3¢(+0.7$)
Will a nuclear weapon detonate in 2024?🔴 -11.5¢(-0.7$)
Positions for closing:
Will North Korea invade South Korea in 2024?🔴 52.9%
Cheaper confident bets:
Will Trump win 7 swing states?🔴 2,733.1% ARR (76.7¢ -> 71.5¢)
Will Kamala do better than Biden with unmarried women? 🟢 2,225% ARR (83¢ -> 75.5¢)
Will Trump win 30% of Black men?🔴 2,165.3% ARR (78¢ -> 76¢)
Will a Democrat win New Mexico Presidential Election?🟢 847.5% ARR (90¢ -> 89¢)
Rising bets to add funds:
Will Donald Trump win the popular vote in the 2024 Presidential Election?🔴 4,774.6% ARR (57.4¢ -> 59¢)
Will Donald Trump win the 2024 US Presidential Election?🟢 3,400.1% ARR (60¢ -> 66.9¢)
Will Trump do better with LGTBQ voters than in 2020?🔴 3,377.2% ARR (66¢ -> 67¢)
2024 presidential election: GOP wins by 65-104🔴 2,225% ARR (70¢ -> 75.5¢)
Trump wins a solid blue state?🔴 1,404.4% ARR (79¢ -> 83¢)
```
You can easily try it out! No auth info is needed for a simple local run, when the output is printed to console. Just set your `user_id` in `helpers.ts` and run `npm run local` to see your status similar to above.
# TODO
Consider ARR formula - a days delay for disputes and resolutions, and APR vs. APY