import { isAllowedCommand } from './is-allowed-commands.ts';
import { it, describe } from 'node:test';
import assert from 'assert';

describe('isAllowedCommand', () => {
  [
    'cat somefile | grep myname | sed dkasopdsa | grep dkaopdks',
    'ls',
    'grep',
    'sed',
  ].forEach((cmds) => {
    it('should allow', () => {
      assert.strictEqual(true, isAllowedCommand(cmds).isAllowed);
    })
  });
  [
    'ls -lah | rm -rf',
    'find -lah | xargs -n 1 -I{} rm {}',
  ].forEach((cmds) => {
    it('should disallow', () => {
      assert.strictEqual(false, isAllowedCommand(cmds).isAllowed);
    })
  })
})
