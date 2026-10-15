import { describe, expect, it } from 'vitest';
import { rateLimitBucketForIp } from '@/lib/server/client-ip-bucket';

describe('rateLimitBucketForIp', () => {
  it('laisse une adresse IPv4 inchangée', () => {
    expect(rateLimitBucketForIp('198.51.100.10')).toBe('198.51.100.10');
  });

  it('regroupe un IPv6 complet par préfixe /64', () => {
    expect(rateLimitBucketForIp('2001:db8:aaaa:bbbb:1111:2222:3333:4444')).toBe(
      '2001:db8:aaaa:bbbb::/64',
    );
  });

  it('donne le même seau à deux adresses d’un même /64, abrégées ou non', () => {
    const a = rateLimitBucketForIp('2001:db8:0:1::1');
    const b = rateLimitBucketForIp('2001:0DB8:0000:0001:ffff:ffff:ffff:ffff');
    const c = rateLimitBucketForIp('2001:db8:0:1:0:0:0:2');
    expect(a).toBe('2001:db8:0:1::/64');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('sépare deux /64 distincts', () => {
    expect(rateLimitBucketForIp('2001:db8:0:1::1')).not.toBe(
      rateLimitBucketForIp('2001:db8:0:2::1'),
    );
  });

  it('développe correctement un « :: » situé au début, au milieu ou à la fin', () => {
    expect(rateLimitBucketForIp('::1')).toBe('0:0:0:0::/64');
    expect(rateLimitBucketForIp('2001:db8::')).toBe('2001:db8:0:0::/64');
    expect(rateLimitBucketForIp('2001:db8::5:6:7:8')).toBe('2001:db8:0:0::/64');
    expect(rateLimitBucketForIp('1:2:3::8')).toBe('1:2:3:0::/64');
  });

  it('ignore l’identifiant de zone', () => {
    expect(rateLimitBucketForIp('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('ramène une adresse IPv4 mappée en IPv6 à son IPv4', () => {
    expect(rateLimitBucketForIp('::ffff:198.51.100.10')).toBe('198.51.100.10');
    expect(rateLimitBucketForIp('::ffff:c633:640a')).toBe('198.51.100.10');
  });

  it('accepte une queue IPv4 dans un IPv6 non mappé', () => {
    expect(rateLimitBucketForIp('64:ff9b::198.51.100.10')).toBe('64:ff9b:0:0::/64');
  });

  it('retombe sur la valeur d’origine si elle n’est pas analysable', () => {
    expect(rateLimitBucketForIp('pas-une-ip')).toBe('pas-une-ip');
    expect(rateLimitBucketForIp('1:2:3:4:5:6:7:8:9')).toBe('1:2:3:4:5:6:7:8:9');
    expect(rateLimitBucketForIp('1::2::3')).toBe('1::2::3');
  });
});
