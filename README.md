# DORO — 전국 실시간 교통량

한국도로공사 공공데이터를 OpenStreetMap 위에 구간별로 그리는 실시간 고속도로 소통 지도.

![landing](docs/landing.png)
![dashboard](docs/dashboard.png)

- `/` — 랜딩 페이지 (실시간 요약 지표 포함)
- `/live` — 인터랙티브 대시보드

## 무엇이 문제였나

한국도로공사의 실시간 소통정보(`odtraffic/trafficAmountByRealtime`)는 콘존(구간)별 속도와
교통량을 주지만 **위경도가 없다**. 콘존은 `구서IC-영락IC` 처럼 시·종점 이름으로만 식별된다.

그래서 좌표를 이렇게 복원한다.

| 단계 | 내용 |
| --- | --- |
| 1 | 영업소·IC 위치 590곳(`locationinfo/locationinfoUnit`)을 앵커로 확보 |
| 2 | 콘존명을 시·종점으로 쪼개고 시설 접미사(IC/JC/TG/하이패스)를 정규화해 매칭 |
| 3 | 좌표가 없는 분기점(JC)은 `conzoneId` 순번을 따라 앵커 사이에서 선형 보간 |
| 4 | 한반도 밖 좌표, 동명 IC 오매칭(60km 초과), 비정상적으로 긴 구간(80km 초과)을 제거 |

결과적으로 1,579개 콘존 중 약 1,080개 구간에 신뢰할 수 있는 지오메트리가 붙는다.
구현은 `lib/geometry.ts`에 있다.

## 기능

- 전국 고속도로 구간을 평균 속도에 따라 색·굵기로 표시 (원활/보통/서행/정체/미수집)
- 노선·방향(상행/하행)·혼잡도 필터, 구간 이름 검색
- 정체 순위 목록 — 클릭하면 지도가 해당 구간으로 이동하고 상세를 보여줌
- 전국 시간당 통행량 집계 (수납 방식·운영 주체·차종별)
- 1분 주기 자동 갱신 (끄고 수동 새로고침 가능)

## 실행

```bash
npm install
echo "EX_API_KEY=발급받은_키" > .env.local
npm run dev
```

API 키는 [공공데이터 포털(data.ex.co.kr)](https://data.ex.co.kr/portal/openapi/openApiInfoM)에서 발급받는다.

## 데이터 출처

| 데이터 | 엔드포인트 |
| --- | --- |
| 실시간 소통정보 | `odtraffic/trafficAmountByRealtime` |
| 전국 통행량 집계 | `trafficapi/trafficAll` |
| 영업소·IC 좌표 | `locationinfo/locationinfoUnit` (`data/units.json`에 스냅숏) |
| 배경 지도 | OpenStreetMap 표준 타일 |

## 구현 노트

- **UA 헤더 필수** — 기본 User-Agent로 호출하면 도로공사 WAF가 `400 Request Blocked`를 반환한다. `lib/ex-api.ts`에서 브라우저 UA를 명시한다.
- **인메모리 캐시** — 실시간 응답이 약 3MB라 Next.js 데이터 캐시(2MB 한도)에 들어가지 않는다. `lib/memo-cache.ts`가 프로세스 수준에서 60초간 재사용하고 동시 요청을 합친다.
- **오프라인 픽스처** — WAF에 일시 차단되면 `EX_FIXTURE_DIR`에 저장한 응답으로 개발할 수 있다 (운영에서는 무시).
- **다크 지도** — OSM 표준 타일에 CSS 필터(`.leaflet-tile-pane`)로 다크 톤을 입힌다. 구간 선은 overlay pane이라 영향받지 않는다.

## 주의

공개 데이터를 시각화한 비공식 프로젝트다. 실제 주행 판단의 근거로 쓰지 말 것.
OpenStreetMap 타일은 [타일 사용 정책](https://operations.osmfoundation.org/policies/tiles/)을 따른다.
