export enum INTENT {
    GREET = "greet",
    ASK_SOURCE = "ask_source",
    ASK_DESTINATION = "ask_destination",
    ASK_TRIP_TYPE = "ask_trip_type",
    CONFIRM_TRIP = "confirm_trip",
    CREATE_TRIP = "create_trip",
    ASK_DATE = "ask_date",
    ASK_PREFERENCES = "ask_preferences",
    GENERAL = "general",
    UNKNOWN = "unknown",
}


export enum TRIP_TYPE {
    ONE_WAY = "one_way",
    ROUND_TRIP = "round_trip",
    NOT_DECIDED = "not_decided"
}

export enum VEHICLE_TYPE {
    SUV = "suv",
    SEDAN = "sedan",
    HATCHBACK = "hatchback",
    NONE = "none"
}

export enum LANGUAGE {
    EN = "en",
    HI = "hi",
    BN = "bn",
    TA = "ta",
    TE = "te",
    MR = "mr",
    GU = "gu",
    KN = "kn",
    ML = "ml",
    PA = "pa",
    OR = "or",
    AS = "as",
    UR = "ur",
    XX = "none"
}



export interface Preferences {
    vehicleType?: VEHICLE_TYPE;
    language?: LANGUAGE;
}

export interface User {
    id: string;
    name: string;
    phone: string;
}

export interface TripState {

    user: User
    agentResponse?: string

    intent: INTENT;
    tripCreated?: boolean;

    source?: string;
    destination?: string;
    tripType?: TRIP_TYPE;
    tripStartDate?: string;
    tripEndDate?: string;

    preferences?: Preferences;
}


