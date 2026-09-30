import { Image, StyleSheet, Text } from 'react-native';
import { CURRENCY_META } from '../data/currency';
import type { CurrencyType } from '../types';

const marbleSource = require('../../assets/icons/marble.png');
const coinSource = require('../../assets/icons/coin.png');
const dollarBillSource = require('../../assets/icons/dollar-bill.png');

type Props = { type: CurrencyType; size?: number; color?: string };

export function CurrencyIcon({ type, size = 18, color }: Props) {
  if (type === 'dollars') {
    return <Image resizeMode="contain" source={dollarBillSource} style={{ height: Math.round(size * 1.08), width: Math.round(size * 1.08) }} />;
  }
  if (type === 'marbles' || type === 'coins') {
    const source = type === 'marbles' ? marbleSource : coinSource;
    return <Image resizeMode="contain" source={source} style={{ height: size, width: size }} />;
  }
  const meta = CURRENCY_META[type];
  return <Text style={[styles.text, { color: color ?? meta.color, fontSize: size, lineHeight: Math.ceil(size * 1.2) }]}>{meta.icon}</Text>;
}

const styles = StyleSheet.create({ text: { fontWeight: '900', includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center' } });
