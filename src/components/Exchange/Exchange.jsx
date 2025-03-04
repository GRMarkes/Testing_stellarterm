import React from 'react';
import PropTypes from 'prop-types';
import * as StellarSdk from '@stellar/stellar-sdk';
import screenfull from 'screenfull';
import directory from 'stellarterm-directory';
import { PriceScaleMode } from '../../../node_modules/lightweight-charts/dist/lightweight-charts.esm.production';
import Driver from '../../lib/driver/Driver';
import Stellarify from '../../lib/helpers/Stellarify';
import Ellipsis from '../Common/Ellipsis/Ellipsis';
import AssetPair from '../Common/AssetPair/AssetPair';
import NotFound from '../NotFound/NotFound';
import images from '../../images';
import { isIE, isEdge } from '../../lib/helpers/BrowserSupport';
import AppLoading from '../AppLoading/AppLoading';
import ManageOffers from './ManageOffers/ManageOffers';
import OfferTables from './OfferTables/OfferTables';
import OfferMakers from './OfferMakers/OfferMakers';
import PairPicker from './PairPicker/PairPicker';
import LightweightChart from './LightweightChart/LightweightChart';
import MarketsHistory from './MarketsHistory/MarketsHistory';
import ChartActionAlert from './ChartActionAlert/ChartActionAlert';
import * as converterOHLC from './LightweightChart/ConverterOHLC';
import DepthChart from './DepthChart/DepthChart';
import processOrderbook from './DepthChart/processOrderbook';
import { MIN_FOR_GROUPING } from '../../lib/constants/orderbookContants';

const BAR = 'barChart';
const CANDLE = 'candlestickChart';
const LINE = 'lineChart';
const keyF = 70;
const LS_DEFAULT_CHART_TYPE_ALIAS = 'defaultChartType';

export default class Exchange extends React.Component {
    constructor(props) {
        super(props);

        this.unsub = this.props.d.orderbook.event.sub(() => {
            this.forceUpdate();
        });
        this.unsubSession = this.props.d.session.event.sub(() => {
            this.forceUpdate();
        });

        this.ubsubHistory = this.props.history.listen(() => {
            if (this.props.history.action === 'POP') {
                this.getTradePair();
            }
        });

        this.state = {
            wrongUrl: false,
            chartType: localStorage.getItem(LS_DEFAULT_CHART_TYPE_ALIAS || 'null') || LINE,
            marketType: 'orderbook',
            fullscreenMode: false,
            showAction: false,
            timeFrame: converterOHLC.FRAME_HOUR,
            scaleMode: PriceScaleMode.Normal,
            isLinear: false,
        };
        this._handleKeyUp = this._handleKeyUp.bind(this);
        this._escExitFullscreen = this._escExitFullscreen.bind(this);
    }

    componentDidMount() {
        this.getTradePair();
        window.scrollTo(0, 0);
        document.addEventListener('keyup', this._handleKeyUp);
        // For handle esc browser from fullscreen
        document.addEventListener('webkitfullscreenchange', this._escExitFullscreen);
        document.addEventListener('mozfullscreenchange', this._escExitFullscreen);
        document.addEventListener('fullscreenchange', this._escExitFullscreen);
        document.addEventListener('MSFullscreenChange', this._escExitFullscreen);
    }

    componentWillUnmount() {
        this.unsub();
        this.unsubSession();
        this.ubsubHistory();
        document.removeEventListener('keyup', this._handleKeyUp);
        document.removeEventListener('webkitfullscreenchange', this._escExitFullscreen);
        document.removeEventListener('mozfullscreenchange', this._escExitFullscreen);
        document.removeEventListener('fullscreenchange', this._escExitFullscreen);
        document.removeEventListener('MSFullscreenChange', this._escExitFullscreen);

        this.props.d.orderbook.stopOrderbook();

        this.props.d.trades.stopStream();

        if (this.state.fullscreenMode) {
            this.toggleFullScreen();
        }
    }

    getChartScreenshot() {
        const chartIsDrawn = this.child.state.trades.length !== 0;

        if (chartIsDrawn) {
            this.child.getScreenshot();
            this.setState({ showAction: true });
            setTimeout(() => {
                this.setState({ showAction: false });
            }, 4000);
        }
    }

    getChartSwitcherPanel() {
        const { chartType, fullscreenMode } = this.state;
        const fullscreenBtn = fullscreenMode ? (
            <img src={images['icon-fullscreen-minimize']} alt="F" onClick={() => this.toggleFullScreen()} />
        ) : (
            <img src={images['icon-fullscreen']} alt="F" onClick={() => this.toggleFullScreen()} />
        );
        const fullscreenHint = fullscreenMode ? (
            <div className="btnHint">
                Press <span className="keySpan">F</span> or <span className="keySpan">esc</span> to exit fullscreen
            </div>
        ) : (
            <div className="btnHint">
                Press <span className="keySpan">F</span> to enter fullscreen
            </div>
        );
        const downloadScreenshotBtn = (
            <img
                className="screenshot-btn"
                src={images['icon-photo']}
                alt="Screenshot"
                onClick={() => this.getChartScreenshot()}
            />
        );

        const isMicrosoftBrowser = isIE() || isEdge();

        return (
            <div className="island__header tabs_Switcher">
                <div className="switch_Tabs">
                    <a
                        onClick={() => this.chooseChartType(LINE)}
                        className={chartType === LINE ? 'active_Tab' : ''}
                    >
                        <img src={images['icon-lineChart']} alt="line" />
                        <span>Linechart</span>
                    </a>
                    <a
                        onClick={() => this.chooseChartType(CANDLE)}
                        className={chartType === CANDLE ? 'active_Tab' : ''}
                    >
                        <img src={images['icon-candleChart']} alt="candle" />
                        <span>Candlestick</span>
                    </a>
                    <a
                        onClick={() => this.chooseChartType(BAR)}
                        className={chartType === BAR ? 'active_Tab' : ''}
                    >
                        <img src={images['icon-barChart']} alt="bar" />
                        <span>Bar chart</span>
                    </a>
                </div>
                <div className="fullscreen_Block">
                    {!isMicrosoftBrowser ? (
                        <div className="actionBtn">
                            {downloadScreenshotBtn}
                            <div className="btnHint">Take screenshot</div>
                        </div>
                    ) : null}
                    {screenfull.enabled ? (
                        <div className="actionBtn">
                            {fullscreenBtn}
                            {fullscreenHint}
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    getTradePair() {
        const { pathname } = window.location;
        const urlParts = pathname.split('/');
        if (urlParts.length === 4) {
            try {
                const baseBuying = Stellarify.parseAssetSlug(urlParts[2]);
                const counterSelling = Stellarify.parseAssetSlug(urlParts[3]);
                this.props.d.orderbook.setOrderbook(baseBuying, counterSelling);
                this.props.d.trades.setPair(baseBuying, counterSelling);
            } catch (e) {
                console.error(e);
                this.setState({ wrongUrl: true });
            }
            return;
        }
        if (!this.props.d.orderbook.data.ready) {
            const baseBuying = StellarSdk.Asset.native();
            const counterSelling = new StellarSdk.Asset(
                'USDC',
                'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
            );

            this.props.d.orderbook.setOrderbook(baseBuying, counterSelling);
            this.props.d.trades.setPair(baseBuying, counterSelling);
            window.history.replaceState({}, null, `${Stellarify.pairToExchangeUrl(baseBuying, counterSelling)}`);
            return;
        }
        const { baseBuying, counterSelling } = this.props.d.orderbook.data;
        window.history.replaceState({}, null, `${Stellarify.pairToExchangeUrl(baseBuying, counterSelling)}`);
    }

    chooseChartType(type) {
        this.setState({ chartType: type });
        localStorage.setItem(LS_DEFAULT_CHART_TYPE_ALIAS, type);
    }

    toggleFullScreen() {
        if (this.props.d.modal.active) {
            return;
        }
        if (screenfull.isFullscreen) {
            this.setState({ fullscreenMode: false });
            screenfull.exit();
        } else if (!screenfull.isFullscreen) {
            screenfull.request();
            this.setState({ fullscreenMode: true });
            window.scrollTo(0, 0);
        }
    }

    _escExitFullscreen() {
        const noBrowserFullscreen =
            !document.fullscreenElement &&
            !document.webkitIsFullScreen &&
            !document.mozFullScreen &&
            !document.msFullscreenElement;

        if (noBrowserFullscreen) {
            this.setState({ fullscreenMode: false });
        }
    }

    _handleKeyUp({ keyCode }) {
        if (keyCode === keyF && screenfull.enabled && !isIE()) {
            this.toggleFullScreen();
        }
    }

    checkOrderbookWarning() {
        const ticker = this.props.d.ticker;
        const data = this.props.d.orderbook.data;

        if (ticker.ready) {
            const baseSlug = Stellarify.assetToSlug(data.baseBuying);
            const counterSlug = Stellarify.assetToSlug(data.counterSelling);
            let aggregateDepth = 0;

            if (baseSlug !== 'XLM-native') {
                ticker.data.assets.forEach(asset => {
                    if (asset.slug === baseSlug) {
                        aggregateDepth += asset.depth10_USD;
                    }
                });
            }

            if (counterSlug !== 'XLM-native') {
                ticker.data.assets.forEach(asset => {
                    if (asset.slug === counterSlug) {
                        aggregateDepth += asset.depth10_USD;
                    }
                });
            }

            if (aggregateDepth < 100) {
                return (
                    <div className="Exchange__warning">
                        <div className="s-alert s-alert--warning">
                            The orderbook for this pair is thin. To get a better price, create an offer without taking
                            an existing one.
                        </div>
                    </div>
                );
            }
        }
        return null;
    }

    render() {
        if (this.state.wrongUrl) {
            return <NotFound pageName="exchange" />;
        }

        const { orderbook } = this.props.d;
        const { data } = orderbook;

        if (!data.ready) {
            return this.state.fullscreenMode ? (
                <div className="fullscreen_Loading">
                    Loading orderbook data from Horizon
                    <Ellipsis />
                </div>
            ) : (
                <AppLoading text="Loading orderbook data from Horizon" />
            );
        }

        const thinOrderbookWarning = this.checkOrderbookWarning();
        const directoryAsset = directory.getAssetByAccountId(data.baseBuying.code, data.baseBuying.issuer);

        let offermakers;
        if (directoryAsset !== null && directoryAsset.disabled) {
            offermakers = (
                <div className="Exchange__orderbookDisabled">
                    Offer making has been disabled for this pair. You may still cancel your existing offers below.
                </div>
            );
        } else {
            offermakers = <OfferMakers d={this.props.d} />;
        }

        const { chartType, marketType, fullscreenMode, timeFrame, scaleMode, showAction, isLinear } = this.state;
        const { baseBuying, counterSelling, asks: asksFromHorizon, bids: bidsFromHorizon } = data;
        const chartSwitcherPanel = this.getChartSwitcherPanel();
        const pairName = `${baseBuying.code}/${counterSelling.code}`;
        const isOrderbookTab = marketType === 'orderbook';
        const isHistoryTab = marketType === 'history';
        const isDepthTab = marketType === 'depth';
        const pairPickerClass = `so-back islandBack islandBack--t ${fullscreenMode ? 'hidden-pair' : ''}`;
        const uniqPairKey = Stellarify.pairToExchangeUrl(baseBuying, counterSelling);

        const isThinOrderbook = !asksFromHorizon.length || !bidsFromHorizon.length;
        const { asks = [], bids = [] } =
            (isDepthTab && !isThinOrderbook) ? processOrderbook(asksFromHorizon, bidsFromHorizon) : {};

        const showLinearCheckbox = (isDepthTab && asks.length > 1 && bids.length > 1);


        return (
            <div key={uniqPairKey}>
                <div className={pairPickerClass}>
                    <PairPicker d={this.props.d} />
                </div>
                {fullscreenMode ? (
                    <AssetPair
                        baseBuying={baseBuying}
                        counterSelling={counterSelling}
                        fullscreen={fullscreenMode}
                        d={this.props.d}
                        swap
                        dropdown
                    />
                ) : null}
                <div className={`so-back islandBack ${fullscreenMode ? 'fullScreenChart' : ''}`}>
                    <div className="island ChartChunk" id="ChartChunk">
                        {chartSwitcherPanel}
                        {showAction ? <ChartActionAlert text={'Chart screenshot downloaded!'} /> : null}
                        <LightweightChart
                            d={this.props.d}
                            lineChart={chartType === LINE}
                            candlestickChart={chartType === CANDLE}
                            barChart={chartType === BAR}
                            timeFrame={timeFrame}
                            scaleMode={scaleMode}
                            fullscreen={fullscreenMode}
                            pairName={pairName}
                            ref={instance => {
                                this.child = instance;
                            }}
                            onUpdate={(stateName, stateValue) => this.setState({ [stateName]: stateValue })}
                        />
                    </div>
                </div>
                <div className="so-back islandBack">
                    <div className="island">
                        <div className="island__header">Create new offer</div>
                        {thinOrderbookWarning}
                        {offermakers}
                    </div>
                </div>

                <div className="so-back islandBack">
                    <div className="island Orderbook">
                        <div className="island__header tabs_Switcher">
                            <div className="switch_Tabs">
                                <a
                                    onClick={() => this.setState({ marketType: 'orderbook' })}
                                    className={isOrderbookTab ? 'active_Tab' : ''}
                                >
                                    <span>Orderbook</span>
                                </a>
                                <a
                                    onClick={() => this.setState({ marketType: 'depth' })}
                                    className={isDepthTab ? 'active_Tab' : ''}
                                >
                                    <span>Market depth</span>
                                </a>
                                <a
                                    onClick={() => this.setState({ marketType: 'history' })}
                                    className={isHistoryTab ? 'active_Tab' : ''}
                                >
                                    <span>Trades history</span>
                                </a>
                            </div>
                            {showLinearCheckbox && <div
                                className="ListHeader_lowTradable"
                                onClick={() => {
                                    this.setState({ isLinear: !isLinear });
                                }}
                            >
                                Linear
                                <input
                                    type="checkbox"
                                    readOnly
                                    checked={isLinear}
                                />
                                <span className="custom-checkbox">
                                    {isLinear && <img src={images['icon-tick-green']} alt="✓" />}
                                </span>
                            </div>}
                            {isOrderbookTab && <div
                                className="ListHeader_zoom"
                            >
                                {Boolean(orderbook.zoomValue) && <span>{orderbook.zoomValue}</span>}
                                <button
                                    onClick={() => orderbook.decreaseZoom()}
                                    disabled={!orderbook.zoomValue}
                                >
                                    <img src={images['icon-minus-small']} alt="-" />
                                </button>
                                <button
                                    onClick={() => orderbook.increaseZoom()}
                                    disabled={
                                        orderbook.zoomedAsks.length < MIN_FOR_GROUPING ||
                                        orderbook.zoomedBids.length < MIN_FOR_GROUPING
                                    }
                                >
                                    <img src={images['icon-plus-small']} alt="+" />
                                </button>
                            </div>}
                        </div>
                        {isOrderbookTab ? <OfferTables d={this.props.d} /> : null}
                        {isHistoryTab ? <MarketsHistory d={this.props.d} /> : null}
                        {isDepthTab ?
                            <DepthChart
                                asks={asks}
                                bids={bids}
                                counterSelling={counterSelling}
                                baseBuying={baseBuying}
                                isLinear={isLinear}
                            /> : null}
                    </div>
                </div>

                <div className="so-back islandBack">
                    <div className="island">
                        <div className="island__header">Manage offers</div>
                        <ManageOffers d={this.props.d} />
                    </div>
                </div>
            </div>
        );
    }
}

Exchange.propTypes = {
    d: PropTypes.instanceOf(Driver).isRequired,
    history: PropTypes.objectOf(PropTypes.any),
};
