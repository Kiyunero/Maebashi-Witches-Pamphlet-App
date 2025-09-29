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
                    // ★★★ 改善点① ★★★
                    // 緯度経度がnumber型でない場合、処理をスキップしてエラーを防ぐ
                    if (typeof spot.latitude !== 'number' || typeof spot.longitude !== 'number') {
                        console.warn(`座標データが不正なため、スポットをスキップしました: ${spot.name}`);
                        return; // returnで現在のループを抜けて次に進む
                    }

                    const marker = new google.maps.Marker({
                        position: { lat: spot.latitude, lng: spot.longitude },
                        map: this.map,
                        title: spot.name,
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: "#FF6347",
                            fillOpacity: 1,
                            strokeWeight: 2,
                            strokeColor: "#FFFFFF"
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
                    // ★★★ 改善点② ★★★
                    // こちらでも同様にデータチェックを行う
                    if (typeof spot.latitude !== 'number' || typeof spot.longitude !== 'number') {
                        return null; // 不正なデータはnullとしてマーク
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

                // ★★★ 改善点③ ★★★
                // nullとしてマークしたものを配列から除外する
                this.spotsWithCoords = newCoords.filter(spot => spot !== null);
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