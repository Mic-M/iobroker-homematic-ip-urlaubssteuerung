/*******************************************************************************
 * ---------------------------
 * Script "Homematic IP Heizkörperthermostate autmatisch auf Urlaubsmodus setzen".
 * Das Script legt Datenpunkte in dem unten angegebenen Pfad an. Damit können
 * im VIS beliebig viele Urlaubsperioden definiert werden (Datum von/bis). Fällt
 * das Datum in einen der Zeiträume, so setzt das Script bei allen HM-IP-Thermostaten
 * das Wochenprogramm, in welchem die Temperaturen auf "Urlaub" eingestellt ist. Ist 
 * der Zeitraum vorbei, setzt das Script wieder auf das "normale" Wochenprogramm.
 * ----------------------------------------------------
 * Voraussetzungen:
 *  - Homematic RPC Adapter
 *  - Homematic IP Heizkörperthermostate (getestet mit: HmIP-eTRV-2)
 * ----------------------------------------------------
 * Quelle: https://github.com/Mic-M/iobroker.homematic-ip-urlaubssteuerung
 * Support: https://forum.iobroker.net/
 * ----------------------------------------------------
 * Change Log:
 *  0.1 Mic - Initial Release
 * ----------------------------------------------------
 * Autor: Mic (ioBroker-Forum) / Mic-M (Github)
 ******************************************************************************/


/*******************************************************************************
 * Konfiguration: Pfade / Datenpunkte
 ******************************************************************************/

// Pfad, unter dem die Datenpunkte angelegt werden sollen, mit abschließendem Punkt "."
const STATEPATH = 'javascript.0.Heizung._Urlaubsmodus.';

// Wie viele unterschiedliche Urlaube zur Vorausplanung?
// Mehr als 10-20 machen wohl keinen Sinn, es sei denn ständig unterwegs :-)
const HOLIDAY_QTY = 5;

/*******************************************************************************
 * Konfiguration: Homematic IP
 ******************************************************************************/

// Welche Instanz hat der HomeMatic RPC Adapter (hm-rpc.X), in dem die
// Homematic IP Heizungsthermostate sind?
const HM_RPC_INSTANCE = 0;

// Welches HM-Wochenprogramm ist 'Standard', also normales heizen?
const HM_PROFILE_STANDARD = 1;

// Welches HM-Wochenprogramm ist 'Urlaub', also Einstellungen für den Urlaub?
const HM_PROFILE_HOLIDAY = 2;


/*******************************************************************************
 * Experten-Einstellungen
 ******************************************************************************/
// Wann bzw. wie oft aktualisieren? 
const SCHEDULE_PLAN = '2 0 * * *'; // Jeden Tag um 0:02.



/*******************************************************************************
 * Ab hier nichts mehr ändern / Stop editing here!
 ******************************************************************************/

/*******************************************************************************
 * Initiale Function
 *******************************************************************************/
init();
function init() {
    
    // Create states
    createScriptStates();

    // Update Status 'isActive'
    setTimeout(updateAll, 2000);

    // Call main function later
    setTimeout(main, 5000);

}
let mSchedule;
function main() {

    /**
     * 1. Jeden Tag um 0:02 Uhr prüfen auf Gültigkeit und entsprechend Datenpunkte aktualisieren.
     */
    clearSchedule(mSchedule);
    mSchedule = schedule(SCHEDULE_PLAN, updateAll);

    /**
     * 2. Date-Datenpunkte überwachen und bei Änderung ebenfalls Schedule durchführen / aktualisieren
     */
    let regExp = new RegExp('^' + escapeRegExp(STATEPATH) + '.*Date.*');
    on({id: regExp, change:'ne'}, function (obj) {
        updateAll();
    });

    /**
     * 3. Datenpunkt 'IsHoliday' überwachen und bei Änderung schalten wir Urlaubsmodus an/aus von allen Thermostaten.
     */
    on({id: STATEPATH + 'IsHoliday', change:'ne'}, function (obj) {
        let hmProfile;
        let mytext;
        if (obj.state.val) {
            // Urlaubsmodus
            hmProfile = HM_PROFILE_HOLIDAY
            mytext = 'Urlaub Abwesend';
        } else {
            // Standard-Wochenprogramm
            hmProfile = HM_PROFILE_STANDARD
            mytext = 'Standard';
        }

        // Gibt State-IDs zurück, z.B. hm-rpc.0.xxxxxxxxxxxxxxxx.1.ACTIVE_PROFILE
        $('state[id=^hm-rpc.' + HM_RPC_INSTANCE + '.*.1.ACTIVE_PROFILE]').each(function(id) {
            // Nun haben wir mit "id" die State-ID: hm-rpc.0.xxxxxxxxxxxxxxxx.1.ACTIVE_PROFILE
            
            // Thermostat-Wochenprogramm anpassen.
            setState(id, hmProfile);
            
            // Log-Ausgabe
            let deviceID = id.substring(0,id.length-17); // get Device by removing last 17 chars (.1.ACTIVE_PROFILE)
            let deviceName = getObject(deviceID).common.name;
            log(deviceName + ' auf Modus "' + mytext + '" gesetzt.');
        });

    });

}

/**
 * Alle Datumswerte abgleichen und Flag "IsActive" aktualisieren
 */
function updateAll() {
    let isHoliday = false;
    for (let i = 1; i <= HOLIDAY_QTY; i++) {
        let holidayStatus = updateStatus(i);
        if (holidayStatus) isHoliday = true;
    }
    setState(STATEPATH + 'IsHoliday', isHoliday);
    log('Heizungs-Script Urlaubsmodus: alle Zeiträume geprüft und "isActive" von allen aktualisiert.')
}

/**
 * Aktualisiert Flag "IsActive" für gegebene Schedule-Nummer
 * @param {number}   scheduleNumber    Nummer des Urlaubs-Schedules
 * @return {boolean} Ist aktuell bei einem der Schedules Urlaub?
 */
function updateStatus(scheduleNumber) {
    let isHoliday = false;
    if ( G_isDateInRange('now', getState(STATEPATH + scheduleNumber + '-Date-Start').val, getState(STATEPATH + scheduleNumber + '-Date-End').val) ) {
        setState(STATEPATH + scheduleNumber + '-IsActive', true);
        isHoliday = true;
    } else {
        setState(STATEPATH + scheduleNumber + '-IsActive', false);
    }      
    return isHoliday;
}


/**
 * Create states we need.
 */
function createScriptStates() {
    for (let i = 1; i <= HOLIDAY_QTY; i++) {
        createState(STATEPATH + i + '-Date-Start', {'name':'Urlaubsmodus ' + i + ' - Anfang', 'type':'string', 'read':true, 'write':true, 'role':'state', 'def':'2019-01-23'});
        createState(STATEPATH + i + '-Date-End',   {'name':'Urlaubsmodus ' + i + ' - Ende', 'type':'string', 'read':true, 'write':true, 'role':'state', 'def':'2019-01-29'});
        createState(STATEPATH + i + '-IsActive',   {'name':'Urlaubsmodus ' + i + ' - Aktiv?', 'type':'boolean', 'read':true, 'write':false, 'role':'state', 'def':false});
    }
    createState(STATEPATH + 'IsHoliday',   {'name':'Ist aktuell Urlaub?', 'type':'boolean', 'read':true, 'write':false, 'role':'state', 'def':false});
}


/**
 * Escapes string for use in Javascript RegExp
 * Source: https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
