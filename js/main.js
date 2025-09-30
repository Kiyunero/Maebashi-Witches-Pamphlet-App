// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyA5chhVjnyFeuh5wBLTnrA5CggZXq2nTpU",
    authDomain: "maebashi-witches-pamphlet-app.firebaseapp.com",
    projectId: "maebashi-witches-pamphlet-app",
    storageBucket: "maebashi-witches-pamphlet-app.firebasestorage.app",
    messagingSenderId: "148484635125",
    appId: "1:148484635125:web:ac568c838a3f92c816c8bc",
    measurementId: "G-E0DEGJGRY6"
  };

// Firebaseの初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Google マップが読み込まれたら実行
function initMap() {
    const app = Vue.createApp({
        data() {
            return {
                map: null,
                spots: [],
                spotsWithCoords: [],
                markers: [],
                goods: [],
                isPurchasePageVisible: false,
                isPurchasing: false,
                isAuthModalVisible: false,
                enteredAuthToken: '',
                currentUser: null,
                userListener: null,
                // ★★★ 修正点①: ポップアップのDOM要素を保存する場所を追加 ★★★
                popupElements: {},
            };
        },
        mounted() {
            this.map = new google.maps.Map(document.getElementById('map'), {
                center: { lat: 36.391, lng: 139.069 },
                zoom: 17,
                disableDefaultUI: true,
                gestureHandling: 'greedy',
                styles: [
                    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
                    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
                    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
                    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
                    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
                    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
                ]
            });

            this.fetchDataFromFirestore();

            this.map.addListener('bounds_changed', () => {
                this.updateOverlayPositions();
            });

            // ★★★ 修正点②: Intersection Observerを設定 ★★★
            // 要素が画面に入ったか/出たかを監視するオブザーバーを作成
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    // 画面内に入ってきたら is-visible クラスを追加
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                    } 
                    // 画面外に出たら is-visible クラスを削除（再度入ってきた時にアニメーションさせるため）
                    else {
                        entry.target.classList.remove('is-visible');
                    }
                });
            }, { 
                root: document.querySelector('#app'), // 画面（#app）を基準に監視
                threshold: 0.1 // 要素が10%見えたら反応
            });

            // 監視対象を全てのポップアップ要素にする
            // spotsWithCoordsが更新されるたびに監視対象を更新する
            this.$watch('spotsWithCoords', (newSpots) => {
                this.$nextTick(() => {
                    newSpots.forEach(spot => {
                        const el = this.popupElements[spot.id];
                        if (el) {
                            observer.observe(el);
                        }
                    });
                });
            }, { deep: true });
        },
        methods: {
            async fetchDataFromFirestore() {
                try {
                    const spotsSnapshot = await db.collection('spots').get();
                    this.spots = spotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    const goodsSnapshot = await db.collection('goods').orderBy('requiredPoints', 'asc').get();
                    this.goods = goodsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    
                    this.placeMarkers();
                } catch (error) {
                    console.error("データ取得エラー: ", error);
                }
            },

            placeMarkers() {
                this.spots.forEach(spot => {
                    if (typeof spot.latitude !== 'number' || typeof spot.longitude !== 'number') {
                        console.warn(`座標データが不正なため、スポットをスキップしました: ${spot.name}`);
                        return;
                    }

                    const marker = new google.maps.Marker({
                        position: { lat: spot.latitude, lng: spot.longitude },
                        map: this.map,
                        title: spot.name,
                        icon: {
                            path: 'M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z',
                            fillColor: "#FFD700",
                            fillOpacity: 1,
                            strokeWeight: 1,
                            strokeColor: "#FFFFFF",
                            rotation: 0,
                            scale: 1.5,
                            anchor: new google.maps.Point(12, 12)
                        }
                    });
                    this.markers.push(marker);
                });
                
                setTimeout(() => this.updateOverlayPositions(), 100);
            },

            updateOverlayPositions() {
                const projection = this.map.getProjection();
                if (!projection) return;

                const mapBounds = this.map.getBounds();
                if (!mapBounds) return;

                const northEast = projection.fromLatLngToPoint(mapBounds.getNorthEast());
                const southWest = projection.fromLatLngToPoint(mapBounds.getSouthWest());
                const scale = Math.pow(2, this.map.getZoom());

                const newCoords = this.spots.map(spot => {
                    if (typeof spot.latitude !== 'number' || typeof spot.longitude !== 'number') {
                        return null;
                    }

                    const latLng = new google.maps.LatLng(spot.latitude, spot.longitude);
                    const worldPoint = projection.fromLatLngToPoint(latLng);

                    const offsetX = worldPoint.x - southWest.x;
                    const offsetY = worldPoint.y - northEast.y;

                    const pinScreenX = offsetX * scale;
                    const pinScreenY = offsetY * scale;
                    
                    const popupX = pinScreenX + 150;
                    const popupY = pinScreenY - 120;

                    return {
                        ...spot,
                        pin: { x: pinScreenX, y: pinScreenY },
                        popup: { x: popupX, y: popupY }
                    };
                });
                this.spotsWithCoords = newCoords.filter(spot => spot !== null);
            },
            
            flyToSpot(spot) {
                const targetLatLng = new google.maps.LatLng(spot.latitude, spot.longitude);
                this.map.panTo(targetLatLng);
                this.map.setZoom(18);
            },

            showAuthModal() {
                this.isAuthModalVisible = true;
                this.enteredAuthToken = '';
            },
            hideAuthModal() {
                this.isAuthModalVisible = false;
            },
            async loginWithAuthToken() {
                if (this.enteredAuthToken.length !== 6) return alert("6桁の数字を入力してください。");
                const tokenRef = db.collection('authTokens').doc(this.enteredAuthToken);
                const tokenDoc = await tokenRef.get();
                if (!tokenDoc.exists) return alert("合言葉が正しくありません。");
                const userId = tokenDoc.data().userId;
                this.setupUserListener(userId);
                await tokenRef.delete();
                this.hideAuthModal();
            },
            
            setupUserListener(userId) {
                if (this.userListener) this.userListener();
                const userRef = db.collection('users').doc(userId);
                this.userListener = userRef.onSnapshot(doc => {
                    if (doc.exists) {
                        this.currentUser = doc.data();
                    }
                });
            },

            showPurchasePage() { this.isPurchasePageVisible = true; },
            hidePurchasePage() { this.isPurchasePageVisible = false; },
            canPurchase(good) {
                return this.currentUser && this.currentUser.points >= good.requiredPoints;
            },
            async purchaseWithPoints(good) {
                if (!this.canPurchase(good)) return alert("ポイントが不足しています。");
                if (!confirm(`${good.name}を ${good.requiredPoints}P で購入しますか？`)) return;
                this.isPurchasing = true;
                const userRef = db.collection('users').doc(this.currentUser.userId);
                try {
                    await db.runTransaction(async (transaction) => {
                        const userDoc = await transaction.get(userRef);
                        const currentPoints = userDoc.data().points || 0;
                        if (currentPoints < good.requiredPoints) throw "ポイント不足";
                        const newPoints = currentPoints - good.requiredPoints;
                        transaction.update(userRef, { points: newPoints });
                    });
                    alert(`🎉 ${good.name} を購入しました！`);
                    console.log(`商品ID: ${good.id} の排出を指示`);
                } catch (error) {
                    alert("購入処理中にエラーが発生しました。");
                } finally {
                    this.isPurchasing = false;
                }
            }
        }
    });
    window.vueApp = app.mount('#app');
}

// 広告画面の操作
document.addEventListener('DOMContentLoaded', () => {
    const adScreen = document.getElementById('ad-screen');
    const mainContent = document.getElementById('main-content');
    adScreen.addEventListener('click', () => {
        adScreen.style.display = 'none';
        mainContent.classList.remove('hidden');
    });
});