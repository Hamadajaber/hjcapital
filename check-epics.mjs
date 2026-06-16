// Script to verify Capital.com epics for GOLD and NASDAQ
import { getSessionTokens, getMarketPrice } from './server/capitalcom.ts';

const epicsToCheck = ['GOLD', 'US100', 'US500', 'EURUSD', 'DE40'];

try {
  console.log('Checking Capital.com epics...');
  for (const epic of epicsToCheck) {
    try {
      const price = await getMarketPrice(epic);
      console.log(`✅ ${epic}: bid=${price.bid}, ask=${price.ask}, mid=${((price.bid + price.ask) / 2).toFixed(5)}`);
    } catch (err) {
      console.log(`❌ ${epic}: ${err.message}`);
    }
  }
} catch (err) {
  console.error('Fatal:', err.message);
}
