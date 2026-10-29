import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanText, luhnOk, pdfText } from './ci-private-data.mjs'

// Fixtures are built at runtime from clearly fake parts; nothing real-looking is committed.
const at = 'a' + 't'
const fakeMail = ['jane.fake', 'not-a-real-mailbox.se'].join('@')
const fakePhoneSe = ['+46', '70', '987', '65', '43'].join(' ')
const fakePhoneIntl = ['+1', '555', '010', '2468'].join('-')
const fakeLocalSe = ['070', '987 65 43'].join('-')
// 19121212-1212 is the published Swedish tax agency test identity (Luhn-valid, not a person).
const fakePnr = ['19121212', '1212'].join('-')
const fakeHomeWin = ['C:', 'Users', 'fakeperson', 'cv.json'].join('\\')
const fakeDebt = ['Skuld till Kronofogden:', '12 345', 'kr'].join(' ')

const cats = (text) => scanText(text).map((f) => f.category)

test('positive controls: each category is caught', () => {
  assert.deepEqual(cats(`mail ${fakeMail}`), ['email'])
  assert.deepEqual(cats(`ring ${fakePhoneSe}`), ['phone'])
  assert.deepEqual(cats(`call ${fakePhoneIntl}`), ['phone'])
  assert.deepEqual(cats(`mobil ${fakeLocalSe}`), ['phone'])
  assert.deepEqual(cats(`id ${fakePnr}`), ['personnummer'])
  assert.deepEqual(cats(`path ${fakeHomeWin}`), ['home-path'])
  assert.deepEqual(cats(fakeDebt), ['debt-amount'])
  assert.deepEqual(cats(`I owe SEK 4 000 to a lender`), ['debt-amount'])
})

test('findings carry line numbers and never the matched value', () => {
  const found = scanText(`clean\nmail ${fakeMail}`)
  assert.equal(found.length, 1)
  assert.equal(found[0].line, 2)
  assert.deepEqual(Object.keys(found[0]).sort(), ['category', 'line'])
})

test('negative controls: clean text passes', () => {
  const clean = [
    'version 1.2.0 released 2026-10-29',
    'see https://github.com/example/repo/pull/98',
    'bump tauri 2.1.1 and vite 5.4.10',
    `contact noreply${at}github.com or someone${at}example.com`,
    `bot ${'1234+bot'}${at}users.noreply.github.com`,
    'path /home/user/project and C:\\Users\\username\\x',
    'timestamp 20261029-1530 build 20261029-0000',
    'debt is a word here',
    'price 120 kr for coffee',
    'id 19121212-1213 fails the check digit',
    'order 46 70 000 is not a phone',
    `sample ${['+46', '70', '000', '00', '00'].join(' ')} placeholder, ${['+46', '70', '1234567'].join(' ')} counting run, and someone${at}example.test`,
    `icon ${'icon'}${at}2x.png`,
  ].join('\n')
  assert.deepEqual(scanText(clean), [])
})

test('luhn check digit', () => {
  assert.equal(luhnOk('1212121212'), true)
  assert.equal(luhnOk('1212121213'), false)
})

test('pdf text: returns extracted text, or null when pdftotext is missing', () => {
  const ok = () => ({ status: 0, stdout: `mail ${fakeMail}` })
  assert.deepEqual(scanText(pdfText('x.pdf', ok)).map((f) => f.category), ['email'])
  const missing = () => ({ error: new Error('ENOENT'), status: null, stdout: '' })
  assert.equal(pdfText('x.pdf', missing), null)
})
