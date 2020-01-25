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
 * Support: https://forum.iobroker.net/topic/22140/
 * ----------------------------------------------------
 * Change Log:
 *  0.2 Mic + Support creating states under 0_userdata.0
 *  0.1 Mic - Initial Release
 * ----------------------------------------------------
 * Autor: Mic (ioBroker-Forum) / Mic-M (Github)
 ******************************************************************************/
/*
 * VORAUSSETZUNG:
 * In der Instanz des JavaScript-Adapters die Option [Erlaube das Kommando "setObject"] aktivieren.
 * Das ist notwendig, damit die Datenpunkte unterhalb von 0_userdata.0 angelegt werden können.
 * https://github.com/Mic-M/iobroker.createUserStates
 * Wer das nicht möchte: bitte Script-Version 0.1 verwenden.
 */

/*******************************************************************************
 * Konfiguration: Pfade / Datenpunkte
 ******************************************************************************/

// Pfad, unter dem die States (Datenpunkte) in den Objekten angelegt werden.
// Es wird die Anlage sowohl unterhalb '0_userdata.0' als auch 'javascript.x' unterstützt.
const STATEPATH = '0_userdata.0.Heizung.Urlaubsmodus';

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
 * Global variables and constants
******************************************************************************/

// Final state path
const FINAL_STATE_LOCATION = validateStatePath(STATEPATH, false);
const FINAL_STATE_PATH = validateStatePath(STATEPATH, true) + '.'; // we add a trailing dot



/*******************************************************************************
 * Initiale Function
 *******************************************************************************/
init();
function init() {
    
    // Create all script states
    createUserStates(FINAL_STATE_LOCATION, false, buildScriptStates(), function() {
        // -- All states created, so we continue by using callback

        // Update Status 'isActive'
        setTimeout(updateAll, 2000);

        // Call main function later
        setTimeout(main, 5000);
    
    });

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
    let regExp = new RegExp('^' + escapeRegExp(FINAL_STATE_PATH) + '.*Date.*');
    on({id: regExp, change:'ne'}, function (obj) {
        updateAll();
    });

    /**
     * 3. Datenpunkt 'IsHoliday' überwachen und bei Änderung schalten wir Urlaubsmodus an/aus von allen Thermostaten.
     */
    on({id: FINAL_STATE_PATH + 'IsHoliday', change:'ne'}, function (obj) {
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
    setState(FINAL_STATE_PATH + 'IsHoliday', isHoliday);
    log('Heizungs-Script Urlaubsmodus: alle Zeiträume geprüft und "isActive" von allen aktualisiert.')
}

/**
 * Aktualisiert Flag "IsActive" für gegebene Schedule-Nummer
 * @param {number}   scheduleNumber    Nummer des Urlaubs-Schedules
 * @return {boolean} Ist aktuell bei einem der Schedules Urlaub?
 */
function updateStatus(scheduleNumber) {
    let isHoliday = false;
    if ( isDateInRange('now', getState(FINAL_STATE_PATH + scheduleNumber + '-Date-Start').val, getState(FINAL_STATE_PATH + scheduleNumber + '-Date-End').val) ) {
        setState(FINAL_STATE_PATH + scheduleNumber + '-IsActive', true);
        isHoliday = true;
    } else {
        setState(FINAL_STATE_PATH + scheduleNumber + '-IsActive', false);
    }      
    return isHoliday;
}


/**
 * Build script states.
 */
function buildScriptStates() {
    let finalStates = [];
    for (let i = 1; i <= HOLIDAY_QTY; i++) {
        finalStates.push([FINAL_STATE_PATH + i + '-Date-Start', {'name':'Urlaubsmodus ' + i + ' - Anfang', 'type':'string', 'read':true, 'write':true, 'role':'state', 'def':'2019-01-23'}]);
        finalStates.push([FINAL_STATE_PATH + i + '-Date-End',   {'name':'Urlaubsmodus ' + i + ' - Ende', 'type':'string', 'read':true, 'write':true, 'role':'state', 'def':'2019-01-29'}]);
        finalStates.push([FINAL_STATE_PATH + i + '-IsActive',   {'name':'Urlaubsmodus ' + i + ' - Aktiv?', 'type':'boolean', 'read':true, 'write':false, 'role':'state', 'def':false}]);
    }
    finalStates.push([FINAL_STATE_PATH + 'IsHoliday',   {'name':'Ist aktuell Urlaub?', 'type':'boolean', 'read':true, 'write':false, 'role':'state', 'def':false}]);
    return finalStates;
}


/**
 * Escapes string for use in Javascript RegExp
 * Source: https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}


/**
 * Abfrage, ob ein Datum innerhalb eines Bereichs ist.
 * Angeregt von: https://forum.iobroker.net/topic/2289/
 * Zum Aufruf ist das ISO-Datumsformat JJJJ-MM-TT erforderlich, z.B. 2019-12-24.
 * Autor: Mic
 * Version: 0.2 - 28-Apr-2019
 * Gepostet unter: https://forum.iobroker.net/post/256400
 * @param {string}   strDateToCheck       Das zu prüfende Datum; 
 *                                        Falls aktuelles Datum geprüft werden soll: 'now' eingeben.
 * @param {string}   strDateFirst         Datum: Zeitraum erster Tag.
 * @param {string}   strDateLast          Datum: Zeitraum letzter Tag.
 */
function isDateInRange(strDateToCheck, strDateFirst, strDateLast) {
    // Prepare the date we want to check. Either current date, or provided date in variable strDateToCheck
    let dtToCheck;
    if (strDateToCheck == 'now') {
        dtToCheck = new Date();
    } else {
         dtToCheck = new Date(strDateToCheck);
    }
    dtToCheck.setHours(0, 0, 0, 0); // Same basis for hours, minutes etc. as for all dates
    let dtFirst = new Date(strDateFirst);
    dtFirst.setHours(0, 0, 0, 0);
    let dtLast = new Date(strDateLast);
    dtLast.setHours(0, 0, 0, 0);
    let isInRange = false;
    /* Don't need this, has weird effects if just one date is being changed */
    /*
    if (dtLast < dtFirst) {
        // We need to swap the variables since user mixed up first and last date.
        let dtTempFirst = dtFirst;
        dtFirst = dtLast;
        dtLast = dtTempFirst;
        log('Function isDateInRange: first date is later than last date, but the function corrected this accordingly.', 'debug');
    }
    */
    if ( (dtLast >= dtFirst) && (dtToCheck >= dtFirst) && (dtToCheck <= dtLast) )  {
        isInRange = true;
    }
    return isInRange;
}


/**
 * For a given state path, we extract the location '0_userdata.0' or 'javascript.0' or add '0_userdata.0', if missing.
 * @param {string}  path            Like: 'Computer.Control-PC', 'javascript.0.Computer.Control-PC', '0_userdata.0.Computer.Control-PC'
 * @param {boolean} returnFullPath  If true: full path like '0_userdata.0.Computer.Control-PC', if false: just location like '0_userdata.0' or 'javascript.0'
 * @return {string}                 Path
 */
function validateStatePath(path, returnFullPath) {
    if (path.startsWith('.')) path = path.substr(1);    // Remove first dot
    if (path.endsWith('.'))   path = path.slice(0, -1); // Remove trailing dot
    if (path.length < 1) log('Provided state path is not valid / too short.', 'error')
    let match = path.match(/^((javascript\.([1-9][0-9]|[0-9])\.)|0_userdata\.0\.)/);
    let location = (match == null) ? '0_userdata.0' : match[0].slice(0, -1); // default is '0_userdata.0'.
    if(returnFullPath) {
        return (path.indexOf(location) == 0) ? path : (location + '.' + path);
    } else {
        return location;
    }
}


/**
 * Create states under 0_userdata.0 or javascript.x
 * Current Version:     https://github.com/Mic-M/iobroker.createUserStates
 * Support:             https://forum.iobroker.net/topic/26839/
 * Autor:               Mic (ioBroker) | Mic-M (github)
 * Version:             1.0 (17 January 2020)
 * Example:
 * -----------------------------------------------
    let statesToCreate = [
        ['Test.Test1', {'name':'Test 1', 'type':'string', 'read':true, 'write':true, 'role':'info', 'def':'Hello' }],
        ['Test.Test2', {'name':'Test 2', 'type':'string', 'read':true, 'write':true, 'role':'info', 'def':'Hello' }],
    ];
    createUserStates('0_userdata.0', false, statesToCreate);
 * -----------------------------------------------
 * PLEASE NOTE: Per https://github.com/ioBroker/ioBroker.javascript/issues/474, the used function setObject() 
 *              executes the callback PRIOR to completing the state creation. Therefore, we use a setTimeout and counter. 
 * -----------------------------------------------
 * @param {string} where          Where to create the state: e.g. '0_userdata.0' or 'javascript.x'.
 * @param {boolean} force         Force state creation (overwrite), if state is existing.
 * @param {array} statesToCreate  State(s) to create. single array or array of arrays
 * @param {object} [callback]     Optional: a callback function -- This provided function will be executed after all states are created.
 */
function createUserStates(where, force, statesToCreate, callback = undefined) {
 
    const WARN = false; // Throws warning in log, if state is already existing and force=false. Default is false, so no warning in log, if state exists.
    const LOG_DEBUG = false; // To debug this function, set to true
    // Per issue #474 (https://github.com/ioBroker/ioBroker.javascript/issues/474), the used function setObject() executes the callback 
    // before the state is actual created. Therefore, we use a setTimeout and counter as a workaround.
    // Increase this to 100, if it is not working.
    const DELAY = 50; // Delay in milliseconds (ms)


    // Validate "where"
    if (where.endsWith('.')) where = where.slice(0, -1); // Remove trailing dot
    if ( (where.match(/^javascript.([0-9]|[1-9][0-9])$/) == null) && (where.match(/^0_userdata.0$/) == null) ) {
        log('This script does not support to create states under [' + where + ']', 'error');
        return;
    }

    // Prepare "statesToCreate" since we also allow a single state to create
    if(!Array.isArray(statesToCreate[0])) statesToCreate = [statesToCreate]; // wrap into array, if just one array and not inside an array

    let numStates = statesToCreate.length;
    let counter = -1;
    statesToCreate.forEach(function(param) {
        counter += 1;
        if (LOG_DEBUG) log ('[Debug] Currently processing following state: [' + param[0] + ']');

        // Clean
        let stateId = param[0];
        if (! stateId.startsWith(where)) stateId = where + '.' + stateId; // add where to beginning of string
        stateId = stateId.replace(/\.*\./g, '.'); // replace all multiple dots like '..', '...' with a single '.'
        const FULL_STATE_ID = stateId;

        if( ($(FULL_STATE_ID).length > 0) && (existsState(FULL_STATE_ID)) ) { // Workaround due to https://github.com/ioBroker/ioBroker.javascript/issues/478
            // State is existing.
            if (WARN && !force) log('State [' + FULL_STATE_ID + '] is already existing and will no longer be created.', 'warn');
            if (!WARN && LOG_DEBUG) log('[Debug] State [' + FULL_STATE_ID + '] is already existing. Option force (=overwrite) is set to [' + force + '].');

            if(!force) {
                // State exists and shall not be overwritten since force=false
                // So, we do not proceed.
                numStates--;
                if (numStates === 0) {
                    if (LOG_DEBUG) log('[Debug] All states successfully processed!');
                    if (typeof callback === 'function') { // execute if a function was provided to parameter callback
                        if (LOG_DEBUG) log('[Debug] An optional callback function was provided, which we are going to execute now.');
                        return callback();
                    }
                } else {
                    // We need to go out and continue with next element in loop.
                    return; // https://stackoverflow.com/questions/18452920/continue-in-cursor-foreach
                }
            } // if(!force)
        }

        /************
         * State is not existing or force = true, so we are continuing to create the state through setObject().
         ************/
        let obj = {};
        obj.type = 'state';
        obj.native = {};
        obj.common = param[1];
        setObject(FULL_STATE_ID, obj, function (err) {
            if (err) {
                log('Cannot write object for state [' + FULL_STATE_ID + ']: ' + err);
            } else {
                if (LOG_DEBUG) log('[Debug] Now we are creating new state [' + FULL_STATE_ID + ']')
                let init = null;
                if(param[1].def === undefined) {
                    if(param[1].type === 'number') init = 0;
                    if(param[1].type === 'boolean') init = false;
                    if(param[1].type === 'string') init = '';
                } else {
                    init = param[1].def;
                }
                setTimeout(function() {
                    setState(FULL_STATE_ID, init, true, function() {
                        if (LOG_DEBUG) log('[Debug] setState durchgeführt: ' + FULL_STATE_ID);
                        numStates--;
                        if (numStates === 0) {
                            if (LOG_DEBUG) log('[Debug] All states processed.');
                            if (typeof callback === 'function') { // execute if a function was provided to parameter callback
                                if (LOG_DEBUG) log('[Debug] Function to callback parameter was provided');
                                return callback();
                            }
                        }
                    });
                }, DELAY + (20 * counter) );
            }
        });
    });
}
