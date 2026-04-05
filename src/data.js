// Data compilation functions

export function compileData(instrumentMappings, ratingsMap, fairValueMap, quotesMap = {}) {
  const compiled = [];

  instrumentMappings.forEach(mapping => {
    const instrumentId = mapping.instrumentId;
    const ratings = instrumentId ? ratingsMap[instrumentId] : null;
    const fairValue = instrumentId ? fairValueMap[instrumentId] : null;
    const quote = instrumentId ? quotesMap[instrumentId] : null;

    // Calculate percentage difference from fair value; keep as number for Excel
    let percentageDiff = null;
    const fairValueNum = fairValue?.fair_value?.value;
    const lastTradePrice = quote?.last_trade_price;

    if (fairValueNum && lastTradePrice) {
      const fairValueFloat = parseFloat(fairValueNum);
      const lastTradePriceFloat = parseFloat(lastTradePrice);

      if (!isNaN(fairValueFloat) && !isNaN(lastTradePriceFloat) && lastTradePriceFloat > 0) {
        const diff = ((fairValueFloat - lastTradePriceFloat) / lastTradePriceFloat) * 100;
        const rounded = Number(diff.toFixed(2));
        if (!isNaN(rounded)) {
          percentageDiff = rounded;
        }
      }
    }

    // Calculate percentage of buy ratings; keep as number for Excel
    let buyRatingsPercentage = null;
    const buyRatings = ratings?.summary?.num_buy_ratings || 0;
    const totalRatings = (ratings?.summary?.num_buy_ratings || 0) +
                         (ratings?.summary?.num_hold_ratings || 0) +
                         (ratings?.summary?.num_sell_ratings || 0);

    if (totalRatings > 0) {
      const percentage = (buyRatings / totalRatings) * 100;
      const rounded = Number(percentage.toFixed(2));
      if (!isNaN(rounded)) {
        buyRatingsPercentage = rounded;
      }
    }

    const row = {
      'Symbol': mapping.symbol,
      'Total Ratings': (ratings?.summary?.num_buy_ratings || 0) +
                       (ratings?.summary?.num_hold_ratings || 0) +
                       (ratings?.summary?.num_sell_ratings || 0),
      'Buy Ratings %': buyRatingsPercentage,
      'Fair Value': fairValue?.fair_value?.value || 'N/A',
      'Star Rating': fairValue?.star_rating || 'N/A',
      'Economic Moat': fairValue?.economic_moat || 'N/A',
      'Uncertainty': fairValue?.uncertainty || 'N/A',
      'Stewardship': fairValue?.stewardship || 'N/A',
      'Quote Last Trade Price': quote?.last_trade_price || 'N/A',
      'Potential Profit/Loss %': percentageDiff,
    };

    compiled.push(row);
  });

  return compiled;
}
