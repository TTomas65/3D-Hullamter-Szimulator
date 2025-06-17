/**
 * Source Point Velocity Calculator
 * 
 * This module calculates the velocity of source points in the wave field simulator.
 * The velocity is normalized to 1.0 when the source point's movement speed equals 
 * the expansion speed of the emitted spheres.
 */

class SourceVelocityCalculator {
    constructor() {
        this.expansionRate = 0.02; // Default expansion rate of spheres (matches growthRate in the main code)
        this.baseExpansionSpeed = this.expansionRate * 0.1; // Tényleges tágulási sebesség
        this.baseVelocity = new THREE.Vector3(0, 0, 0); // Csúszkák által beállított alapsebesség
        this.environmentalVelocity = new THREE.Vector3(0, 0, 0); // Környezeti hatások által módosított sebesség
        this.lastSliderChange = Date.now(); // Utolsó csúszka változtatás ideje
    }

    /**
     * Beállítja az alapvektort a csúszkák értékei alapján
     * @param {string} movementType - Mozgás típusa
     * @param {number} sourceSpeedX - X-tengely sebesség
     * @param {number} sourceSpeedY - Y-tengely sebesség
     * @param {number} xMultiplier - X szorzó
     * @param {number} yMultiplier - Y szorzó
     * @param {number} circleRadius - Kör sugara
     * @param {number} circleAngle - Kör szöge
     * @param {number} emitterDirection - Kibocsátó iránya
     */
    setBaseVelocity(movementType, sourceSpeedX, sourceSpeedY, xMultiplier, yMultiplier, circleRadius, circleAngle, emitterDirection) {
        // Kalibrációs tényező
        const calibrationFactor = this.baseExpansionSpeed;
        
        // Alapsebesség vektor beállítása a csúszkák értékei alapján
        switch (movementType) {
            case 'fire':
                this.baseVelocity.set(
                    sourceSpeedX * calibrationFactor * emitterDirection,
                    sourceSpeedY * calibrationFactor,
                    0
                );
                break;
                
            case 'circular':
                const angularSpeed = sourceSpeedX * calibrationFactor / circleRadius;
                this.baseVelocity.set(
                    -Math.sin(circleAngle) * circleRadius * angularSpeed,
                    sourceSpeedY * calibrationFactor,
                    Math.cos(circleAngle) * circleRadius * angularSpeed
                );
                break;
                
            case 'spiral':
                const baseAngularSpeed = sourceSpeedX * calibrationFactor / circleRadius;
                this.baseVelocity.set(
                    -Math.sin(circleAngle) * circleRadius * baseAngularSpeed,
                    sourceSpeedY * calibrationFactor,
                    Math.cos(circleAngle) * circleRadius * baseAngularSpeed
                );
                break;
                
            case 'dual':
                this.baseVelocity.set(
                    sourceSpeedX * calibrationFactor * emitterDirection,
                    sourceSpeedY * calibrationFactor,
                    0
                );
                break;
                
            default: // 'water' vagy egyéb típus
                this.baseVelocity.set(0, 0, 0);
                break;
        }
        
        // Csúszka változtatás idejének frissítése
        this.lastSliderChange = Date.now();
        
        // Környezeti sebesség alaphelyzetbe állítása csúszka változtatáskor
        this.environmentalVelocity.copy(this.baseVelocity);
    }
    
    /**
     * Környezeti hatások hozzáadása a sebességhez
     * @param {THREE.Vector3} pushVelocity - Taszítási sebesség vektor
     */
    addEnvironmentalEffect(pushVelocity) {
        // Mindig frissítjük a környezeti sebességet, ha van taszítás
        // Nem vizsgáljuk az időt, mert a taszítás felülírja a csúszka értékeit
        if (pushVelocity && pushVelocity.length() > 0) {
            this.environmentalVelocity.copy(pushVelocity);
            console.log("Környezeti sebesség frissítve:", this.environmentalVelocity);
        }
    }

    /**
     * Calculate the velocity ratio of a source point
     * @param {boolean} useEnvironmental - Környezeti hatásokat is figyelembe vegyük-e
     * @returns {number} - Velocity ratio (1.0 means source speed equals sphere expansion speed)
     */
    calculateVelocityRatio(useEnvironmental = true) {
        let velocity;
        
        if (useEnvironmental && this.environmentalVelocity.length() > 0) {
            // Ha van környezeti hatás, akkor azt használjuk
            velocity = this.environmentalVelocity.clone();
        } else {
            // Ha nincs környezeti hatás vagy nem kérték, akkor az alapsebességet használjuk
            velocity = this.baseVelocity.clone();
        }
        
        // Calculate the magnitude of the velocity vector
        const speed = velocity.length();
        
        // Calculate the ratio between the source point speed and the sphere expansion rate
        const ratio = speed / this.baseExpansionSpeed;
        
        return ratio;
    }

    /**
     * Calculate the velocity vector for different movement types
     * @param {string} movementType - Type of movement ('fire', 'circular', 'spiral', etc.)
     * @param {number} sourceSpeedX - X-axis speed parameter
     * @param {number} sourceSpeedY - Y-axis speed parameter
     * @param {number} xMultiplier - X movement multiplier for the current movement type
     * @param {number} yMultiplier - Y movement multiplier for the current movement type
     * @param {number} circleRadius - Radius for circular/spiral movement
     * @param {number} circleAngle - Current angle for circular/spiral movement
     * @param {number} emitterDirection - Direction multiplier (1 or -1)
     * @returns {THREE.Vector3} - Calculated velocity vector
     */
    calculateVelocityVector(movementType, sourceSpeedX, sourceSpeedY, xMultiplier, yMultiplier, circleRadius, circleAngle, emitterDirection) {
        // Először beállítjuk az alapvektort a csúszkák értékei alapján
        this.setBaseVelocity(movementType, sourceSpeedX, sourceSpeedY, xMultiplier, yMultiplier, circleRadius, circleAngle, emitterDirection);
        
        // Visszaadjuk a környezeti hatásokkal módosított sebességet
        return this.environmentalVelocity;
    }

    /**
     * Format the velocity ratio for display
     * @param {number} ratio - The velocity ratio
     * @returns {string} - Formatted string for display
     */
    formatVelocityDisplay(ratio) {
        return ratio.toFixed(3);
    }
    
    /**
     * Visszaadja az aktuális sebességvektort
     * @returns {THREE.Vector3} - Az aktuális sebességvektor
     */
    getCurrentVelocity() {
        return this.environmentalVelocity;
    }
}

// Create a global instance of the calculator
const sourceVelocityCalculator = new SourceVelocityCalculator();