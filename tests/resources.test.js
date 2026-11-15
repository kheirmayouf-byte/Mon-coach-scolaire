import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {publicResourceURL,resourceURLs,mediaResource} from '../src/resources.js';
import {teacherText} from '../src/ecoledirecte.js';
test('teacher public links survive import while token-bearing and script URLs remain excluded',()=>{
 const {DOMParser}=new JSDOM('').window;
 assert.equal(teacherText('<p>Regarde <a href="https://tube.example.fr/w/abc">la vidéo</a></p>',DOMParser),'Regarde la vidéo (https://tube.example.fr/w/abc)');
 assert.equal(publicResourceURL('https://example.fr/?token=private'),null);assert.equal(publicResourceURL('javascript:alert(1)'),null);assert.equal(publicResourceURL('https://user:pass@example.fr'),null);
 assert.deepEqual(resourceURLs('Vidéo : https://tube.example.fr/w/abc). Encore https://tube.example.fr/w/abc.'),['https://tube.example.fr/w/abc']);
});
test('media URLs resolve to restricted players with no automatic playback',()=>{
 assert.equal(mediaResource('https://tube-langues-vivantes.apps.education.fr/w/3eHWwMHKsYZTX7pRYYJQ7r').src,'https://tube-langues-vivantes.apps.education.fr/videos/embed/3eHWwMHKsYZTX7pRYYJQ7r?autoplay=0&p2p=0');
 assert.equal(mediaResource('https://cdn.example.fr/cours.mp3').kind,'audio');assert.equal(mediaResource('https://cdn.example.fr/cours.mp4').kind,'video');
 assert.equal(mediaResource('https://youtu.be/M7lc1UVf-VE').src,'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=0&playsinline=1&rel=0');
 assert.equal(mediaResource('https://evil.example.fr/w/3eHWwMHKsYZTX7pRYYJQ7r'),null);assert.equal(mediaResource('https://tube-langues-vivantes.apps.education.fr.evil.fr/w/3eHWwMHKsYZTX7pRYYJQ7r'),null);
});
