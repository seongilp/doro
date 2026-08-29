/**
 * 미리 계산해 둔 콘존별 도로 경로.
 * `scripts/build-conzone-paths.mjs`가 만들고, 서버는 "경로가 있는 콘존"을 가려내는 데,
 * 클라이언트(지도)는 실제로 선을 그리는 데 쓴다.
 */

import conzonePathData from '@/data/conzone-paths.json';
import type { ConzonePathMap } from './types';

interface ConzonePathFile {
  /** OpenStreetMap 도로 선형을 따라 잘라낸 경로 */
  readonly roads: ConzonePathMap;
  /** 도로 선형을 못 얻어 양 끝 앵커를 직선으로 이은 경로 */
  readonly straight: ConzonePathMap;
}

const { roads, straight } = conzonePathData as unknown as ConzonePathFile;

export const conzonePaths: ConzonePathMap = { ...straight, ...roads };
