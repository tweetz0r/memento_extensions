Memento.prototype = {

    aggregatorUrl: "http://mementoproxy.lanl.gov/aggr/timegate/",
    shouldProcessEmbeddedResources: false,
    isMementoActive: false,
    mementoDatetime: false,
    acceptDatetime: false,
    timegateUrl: false,
    originalUrl: false,
    mementoUrl: false,
    mementoBaseUrl: false,
    isPsuedoMemento: false,
    clickedOriginalUrl: false,
    lastMementoUrl: false,
    specialDatetime: false,
    
    // MENU Variables
    menuId: 0,
    contexts: ["page", "link"],
    contextUrlLabel: ["linkUrl", "srcUrl", "frameUrl", "pageUrl"],
    readableAcceptDatetime: "",
    isDatetimeModified: false,
    visitedUrls: {},
    originalMenuIds: [],
    mementoMenuIds: [],
    lastMementoMenuIds: [],
    mementoDatetimeMenuIds: [],
    //visitedOriginalUrls: {},



    parseLinkHeader : function(link) {
        var state = 'start';
        var data = link.split('');
        var uri = '';
        var pt = '';
        var pv = '';
        var d = '';

        var links = {};
        while (data.length) {
            if (state == 'start') {
                d = data.shift();
                while (d.match(/\s/)) d = data.shift();
                if (d != "<") break;
                state = "uri";
            } else if (state == "uri") {
                uri = '';
                d = data.shift();
                while (d != ">") {
                    uri += d;
                    d = data.shift();
                }

                // Check for broken header with a > in the URL
                uritmp = '>';
                d = data.shift();
                while (d.match(/\s/)) {
                    uritmp += d;
                    d = data.shift();
                }
                // Now d is the first non space character, and should be either , or ;
                if (d == ',' || d ==';'){
                    // We're okay
                    links[uri] = {};
                    state = "paramstart";
                } else{
                	// stay in state uri, and continue to append
                    uritmp+=d;
                    uri += uritmp;
                }
                
            } else if (state == 'paramstart') {
                while (d.match(/\s/) != null) d = data.shift();
                if (d == ";") state = 'linkparam';
                else if (d == ',') state = 'start';
                else break
            } else if (state == 'linkparam') {
                d = data.shift();
                while (d.match(/\s/) != null) d = data.shift();
                pt = '';
                while (data.length && d != ' ' && d != '=') {
                    pt += d;
                    d = data.shift();
                }
                while (d.match(/\s/) != null) d = data.shift();
                if (d != "=") break
                state='linkvalue';
                if (links[uri][pt] == undefined) {
                    links[uri][pt] = new Array();
                }
            } else if (state == 'linkvalue') {
                d = data.shift();
                while (d.match(/\s/) != null) d = data.shift();
                pv = '';
                if (d == '"') {
                    pd = d;
                    d = data.shift();
                    while (d != undefined && d != '"' && pd != '\\') {
                        pv += d;
                        pd = d;
                        d = data.shift();
                    }
                } else {
                    while (d != undefined && d != " " && d != ',' && d != ';') {
                        pv += d;
                        d = data.shift();
                    }
                    if (data.length) data.unshift(d);
                }
                state = 'paramstart';
                if(data != undefined){
                    d = data.shift();
                }
                if (pt == 'rel') links[uri][pt] = links[uri][pt].concat(pv.split(' '));
                else links[uri][pt].push(pv);
            }
        }
        return links;
    },

    getUriForRel : function(lhash, rel) {
    	for (var uri in lhash) {
        	params = lhash[uri];
            vals = lhash[uri]['rel'];
            if (vals != undefined) {
                for (var v=0, val; val= vals[v]; v++) {
                    if (val == rel) {
                        return uri;
                    }
                }
            }
        }
        return null;
    },

    getHeader: function(headers, headerName) {
        if (typeof(headers) == "object") {
            for (var i=0, h; h=headers[i]; i++) {
                if (h.name.toLowerCase() == headerName) {
                    return h.value
                }
            }
        }
        else if (typeof(headers) == "string"){
            var headerLines = headers.split("\n")
            for (header in headerLines) {
                var linkParts = headerLines[header].split(':')
                if (linkParts[0].trim().toLowerCase() == headerName) {
                    return linkParts.slice(1, linkParts.length).join(":")
                }
            }
        }
        return false
    },

    getRelUriFromHeaders: function(headers, rel) {
        var linkHeader = this.getHeader(headers, "link")
        var relUrl = false
        if (linkHeader != "") {
            var links = this.parseLinkHeader(linkHeader.trim())
            relUrl = this.getUriForRel(links, rel)
        }
        return relUrl
    },

    ajax: function(uri, method, setAcceptDatetime) {
        var hdrs = {}
        if (setAcceptDatetime) {
            hdrs = {'Accept-Datetime': this.acceptDatetime.toGMTString()}
        }
        var t = $.ajax({
            type: method,
            url: uri,
            headers: hdrs,
            async: false,
            success: function(data, textStatus, jqXHR) {
                return jqXHR
            },
            error: function(jqXHR, status, error) {
                console.log(error)
            }
        })
        return t
    },

    appendAcceptDatetimeHeader: function(headers, datetime) {
        for (var i=0, h; h=headers[i]; i++) {
            if (h['name'].toLowerCase() == "accept-datetime") {
                h.pop()
                break;
            }
        }
        headers.push({"name": "Accept-Datetime", "value": datetime}) 
    },

    getWhiteList: function() {
        uriWhitelist = [];
        uriWhitelist.push(new RegExp('google-analytics\\.com')); // everywhere, just ignore

        return uriWhitelist;
    },

    clearCache: function() {
        chrome.webRequest.handlerBehaviorChanged()
    },

    createContextMenuEntry: function(title, context, enabled, targetUrl) {
        if (targetUrl == undefined || targetUrl == null) 
            targetUrl = ["<all_urls>"]

        var id = chrome.contextMenus.create({
            "title": title,
            "type": "normal",
            "contexts": context,
            "enabled": enabled,
            "targetUrlPatterns": targetUrl
        })
        return id
    },

    updateContextMenu: function() {
        var title = ""

        for (var i=0, c; c=this.contexts[i]; i++) {
            t = []
            if (c == "page") {
                t.push(c)
                // SELECTED MEMENTO DATETIME
                title = "Get near " + this.acceptDatetime.toGMTString()
                enabled = true
                this.mementoMenuIds.push(this.createContextMenuEntry(title, t, enabled))

                // LAST MEMENTO
                title = "Get near current time"
                enabled = true
                this.lastMementoMenuIds.push(this.createContextMenuEntry(title, t, enabled))

                // CURRENT TIME
                var title = "Get at current time"
                var enabled = false
                if (this.mementoDatetime || this.datetimeModified) {
                    enabled = true
                }
                this.originalMenuIds.push(this.createContextMenuEntry(title, t, enabled))

                // MEMENTO DATETIME
                chrome.contextMenus.create({"type": "separator", "contexts": [c]})
                var title = ""
                if (this.mementoDatetime) {
                    title = "Got: " + this.mementoDatetime
                }
                else {
                    title = "Got: current"
                }
                var enabled = false
                this.mementoDatetimeMenuIds.push(this.createContextMenuEntry(title, t, enabled))

            }
            else if (c == "link") {
                // SELECTED MEMENTO DATETIME
                t.push(c)
                title = "Get near " + this.acceptDatetime.toGMTString()
                enabled = true
                this.mementoMenuIds.push(this.createContextMenuEntry(title, t, enabled))

                // LAST MEMENTO
                title = "Get near current time"
                enabled = true
                this.lastMementoMenuIds.push(this.createContextMenuEntry(title, t, enabled))

                // CURRENT TIME
                var title = "Get at current time"
                var enabled = false
                if (this.mementoDatetime) {
                    enabled = true
                }
                this.originalMenuIds.push(this.createContextMenuEntry(title, t, enabled))
            }
        }
    },

    update: function() {
        chrome.contextMenus.removeAll()
        if (!this.readableAcceptDatetime) {
            this.init()
            return
        }
        this.originalMenuIds = []
        this.mementoMenuIds = []
        this.lastMementoMenuIds = []
        this.mementoDatetimeMenuIds = []
        this.updateContextMenu()
    },

    getOriginalUrl: function(reqUrl) {
        var orgUrl = ""

        var orgHeadResponse = this.ajax(reqUrl, "HEAD")
        orgUrl = this.getRelUriFromHeaders(orgHeadResponse.getAllResponseHeaders(), "original")
        if (!orgUrl) {
            for (i in this.visitedUrls) {
                if (i == reqUrl) {
                    orgUrl = this.visitedUrls[i]
                    break
                }
            }
        }
        if (!orgUrl || orgUrl == "" && this.isMementoActive) {
            if (reqUrl.lastIndexOf("http://") > 0) {
                orgUrl = reqUrl.substring(reqUrl.lastIndexOf("http://"))
            }
        }
        if (!orgUrl || orgUrl == "") {
            orgUrl = reqUrl
        }
        return orgUrl
    },

    getTimeGateUrl: function(orgUrl, isTopLevelResource) {
        var tgUrl = ""
        this.isMementoActive = true
        var tgHeadResponse = this.ajax(orgUrl, "HEAD", true)
        if (this.getHeader(tgHeadResponse.getAllResponseHeaders(), "Memento-Datetime")) {
            tgUrl = orgUrl
        }
        else {
            tgUrl = this.getRelUriFromHeaders(tgHeadResponse.getAllResponseHeaders(), "timegate")
        }
        if (!tgUrl) {
            var doNotNeg = this.getRelUriFromHeaders(tgHeadResponse.getAllResponseHeaders(), "type")
            if (doNotNeg == "http://mementoweb.org/terms/donotnegotiate") {
                tgUrl = false
            }
            else {
                tgUrl = this.aggregatorUrl + orgUrl
                if (isTopLevelResource) {
                    this.isPsuedoMemento = true
                }
            }
        }
        return tgUrl
    },

    getUrlParameter: function(url, name) {
        return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(url)||[,""])[1].replace(/\+/g, '%20'))||null;
    },

    filterSearchResultUrl: function(url) {
        if (url.search("http://search.yahoo.com") == 0) {
            url = unescape(url.split("**")[1])
        }
        else if (url.search("https://www.google.com/url") == 0 || url.search("http://www.google.com/url") == 0) {
            url = this.getUrlParameter(url, "url")
        }
        return url
    },

    init: function() {
        title = "Click Memento icon to select date-time"
        this.menuId = chrome.contextMenus.create({
            "title": title,
            "contexts": Memento.contexts,
            "enabled": false
        })
    }
}


Extension.prototype = {

    getTabId: function() {
        return this.tId
    },

    getMementoObject: function() {
        return this.mem
    },

    handleContextMenuClick: function(info, tab) {
        var clickedUrl = ""
        var pageUrl = false
        for (var i in extensionTabs[tab.id].mem.contextUrlLabel) {
            if (info[extensionTabs[tab.id].mem.contextUrlLabel[i]] != undefined) {
                clickedUrl = info[extensionTabs[tab.id].mem.contextUrlLabel[i]]
                pageUrl = (extensionTabs[tab.id].mem.contextUrlLabel[i] == "pageUrl") ? true : false
                break
            }
        }
        if (clickedUrl == "") {
            console.log("ERROR: Unxpected behaviour; Could not determine URL clicked.")
            console.log(info)
            return
        }

        var clickedForOriginal = false
        var clickedForMemento = false
        var clickedForLastMemento = false
        extensionTabs[tab.id].mem.specialDatetime = false

        console.log("clicked url: " + clickedUrl)

        for (var i=0, id; id=extensionTabs[tab.id].mem.originalMenuIds[i]; i++) {
            if (info['menuItemId'] == id) {
                clickedForOriginal = true
                break
            }
        }
        for (var i=0, id; id=extensionTabs[tab.id].mem.mementoMenuIds[i]; i++) {
            if (info['menuItemId'] == id) {
                clickedForMemento = true
                break
            }
        }
        for (var i=0, id; id=extensionTabs[tab.id].mem.lastMementoMenuIds[i]; i++) {
            if (info['menuItemId'] == id) {
                clickedForLastMemento = true
                break
            }
        }
        if (clickedForOriginal) {
            var orgUrl = ""
            orgUrl = extensionTabs[tab.id].mem.getOriginalUrl(clickedUrl)

            if (pageUrl && orgUrl == clickedUrl && extensionTabs[tab.id].mem.originalUrl != null) {
                orgUrl = (extensionTabs[tab.id].mem.originalUrl.length > 0)
                            ? extensionTabs[tab.id].mem.originalUrl
                            : orgUrl
            }

            extensionTabs[tab.id].mem.mementoDatetime = false
            extensionTabs[tab.id].mem.isMementoActive = false
            extensionTabs[tab.id].mem.shouldProcessEmbeddedResources = false
            console.log("Loading Original: " + tab.id, tgUrl)
            chrome.tabs.update(tab.id, {url: orgUrl})
            return
        }
        else if (clickedForMemento) {
            clickedUrl = extensionTabs[tab.id].mem.filterSearchResultUrl(clickedUrl)

            var tgUrl = ""
            var orgUrl = extensionTabs[tab.id].mem.getOriginalUrl(clickedUrl)
            extensionTabs[tab.id].mem.clickedOriginalUrl = orgUrl

            tgUrl = extensionTabs[tab.id].mem.getTimeGateUrl(orgUrl, true)
            if (pageUrl && tgUrl.search(extensionTabs[tab.id].mem.aggregatorUrl) == 0 && extensionTabs[tab.id].mem.timegateUrl != null) {
                console.log(extensionTabs[tab.id].mem.timegateUrl)
                tgUrl = (extensionTabs[tab.id].mem.timegateUrl.length > 0) 
                        ? extensionTabs[tab.id].mem.timegateUrl 
                        : tgUrl
            }
            if (!tgUrl) {
                // do not negotiate
                extensionTabs[tab.id].mem.isMementoActive = false
                extensionTabs[tab.id].mem.shouldProcessEmbeddedResources = false
                extensionTabs[tab.id].mem.isDatetimeModified = false
                chrome.tabs.update(tab.id, {url: clickedUrl})
                return
            }
            window.setTimeout(extensionTabs[tab.id].mem.clearCache(), 2000)
            extensionTabs[tab.id].mem.isMementoActive = true
            extensionTabs[tab.id].mem.shouldProcessEmbeddedResources = true
            extensionTabs[tab.id].mem.isDatetimeModified = false
            console.log("Loading Memento: " + tab.id, tgUrl)
            chrome.tabs.update(tab.id, {url: tgUrl})
            return
        }
        else if (clickedForLastMemento) {
            clickedUrl = extensionTabs[tab.id].mem.filterSearchResultUrl(clickedUrl)
            var lastMemento = ""
            var orgUrl = extensionTabs[tab.id].mem.getOriginalUrl(clickedUrl)

            if (!extensionTabs[tab.id].mem.isMementoActive) {
                extensionTabs[tab.id].mem.clickedOriginalUrl = orgUrl
            }

            lastMemento = extensionTabs[tab.id].mem.getTimeGateUrl(orgUrl, true)
            if (pageUrl && lastMemento.search(extensionTabs[tab.id].mem.aggregatorUrl) == 0 && extensionTabs[tab.id].mem.lastMementoUrl != null) {
                console.log("last mem url: " + extensionTabs[tab.id].mem.lastMementoUrl)
                lastMemento = (extensionTabs[tab.id].mem.lastMementoUrl.length > 0) 
                        ? extensionTabs[tab.id].mem.lastMementoUrl 
                        : lastMemento
            }
            if (!lastMemento) {
                // do not negotiate
                extensionTabs[tab.id].mem.isMementoActive = false
                extensionTabs[tab.id].mem.shouldProcessEmbeddedResources = false
                extensionTabs[tab.id].mem.isDatetimeModified = false
                chrome.tabs.update(tab.id, {url: clickedUrl})
                return
            }
            window.setTimeout(extensionTabs[tab.id].mem.clearCache(), 2000)
            extensionTabs[tab.id].mem.isMementoActive = true
            extensionTabs[tab.id].mem.shouldProcessEmbeddedResources = true
            extensionTabs[tab.id].mem.isDatetimeModified = false 
            extensionTabs[tab.id].mem.specialDatetime = new Date()
            console.log("Loading Last: " + tab.id, lastMemento)
            chrome.tabs.update(tab.id, {url: lastMemento})
            return
        }
    },


    init: function() {

        chrome.webRequest.onBeforeRequest.addListener( function(request) {
            if (extensionTabs[request.tabId] == undefined) {
                return
            }
            for (var i=0, r; r=extensionTabs[request.tabId].requestIds[i]; i++) {
                if (request.requestId == r) {
                    return
                }
            }
            extensionTabs[request.tabId].requestIds.push(request.requestId)

            // not doing memento for known uris that does not have mementos or
            // does not need memento processing.
            var whiteList = extensionTabs[request.tabId].mem.getWhiteList()
            for (var i=0, r; r=whiteList[i]; i++) {
                if (request.url.match(r)) {
                    return
                }
            }
            
            /* 
            * processing embedded resources. 
            */
            if (request.type != "main_frame" 
                && extensionTabs[request.tabId].mem.shouldProcessEmbeddedResources
                && request.url.search("chrome-extension://") < 0) {

                    /*
                    * Testing for re-written embedded urls by comparing the base url of 
                    * the memento with the url of the embedded resource. The 
                    * embedded resources will have the same host if it's rewritten.
                    */
                    if (request.url.search(extensionTabs[request.tabId].mem.mementoBaseUrl) == 0) {
                        extensionTabs[request.tabId].mem.shouldProcessEmbeddedResources = false
                        return
                    }
                    var tgUrl = extensionTabs[request.tabId].mem.getTimeGateUrl(request.url, false)
                    if (!tgUrl) {
                        // do not neg
                        return
                    }
                    return {redirectUrl: tgUrl}
            }
            else if (request.type == "main_frame") {
                extensionTabs[request.tabId].requestIds = []
                extensionTabs[request.tabId].mem.timegateUrl = false
                extensionTabs[request.tabId].mem.originalUrl = false
                extensionTabs[request.tabId].mem.mementoDatetime = false
                extensionTabs[request.tabId].mem.mementoUrl = false
                extensionTabs[request.tabId].mem.shouldProcessEmbeddedResources = false
                extensionTabs[request.tabId].mem.lastMementoUrl = false
            }
        },
        {urls: ["<all_urls>"]},
        ["blocking"])

        
        chrome.webRequest.onBeforeSendHeaders.addListener( function(request) {
            if (extensionTabs[request.tabId] == undefined) {
                return
            }
            if (extensionTabs[request.tabId].mem.isMementoActive) {
                var aDt = {}
                var splDt = false
                if (extensionTabs[request.tabId].mem.specialDatetime) {
                    aDt = extensionTabs[request.tabId].mem.specialDatetime
                    splDt = true
                }
                else {
                    aDt = extensionTabs[request.tabId].mem.acceptDatetime
                }
                if (aDt && !splDt) {
                    extensionTabs[request.tabId].mem.appendAcceptDatetimeHeader(request.requestHeaders, aDt.toGMTString())
                }
                return {requestHeaders: request.requestHeaders}
            }
        },
        {urls: ["http://*/*"]},
        ["blocking", "requestHeaders"])

        chrome.webRequest.MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES = 100

        chrome.webRequest.onHeadersReceived.addListener( function(response) {
            if (extensionTabs[response.tabId] == undefined) {
                return
            }
            if (response.type != "main_frame") {
                return
            }
            if (response.statusLine.search("HTTP/1.1 30") == 0) {
                extensionTabs[response.tabId].mem.lastMementoUrl = extensionTabs[response.tabId].mem.getRelUriFromHeaders(response.responseHeaders, "last")    
                return
            }

            extensionTabs[response.tabId].mem.timegateUrl = extensionTabs[response.tabId].mem.getRelUriFromHeaders(response.responseHeaders, "timegate")
            extensionTabs[response.tabId].mem.originalUrl = extensionTabs[response.tabId].mem.getRelUriFromHeaders(response.responseHeaders, "original")

            /* 
            * checking if this is a native memento resource
            * the "memento-datetime" header confirms this
            */
            for (var i=0, h; h=response.responseHeaders[i]; i++) {
                if (h.name.toLowerCase() == "memento-datetime") {
                    extensionTabs[response.tabId].mem.mementoDatetime = h.value
                    extensionTabs[response.tabId].mem.shouldProcessEmbeddedResources = true
                    extensionTabs[response.tabId].mem.isMementoActive = true
                    extensionTabs[response.tabId].mem.mementoUrl = response.url
                    extensionTabs[response.tabId].mem.visitedUrls[extensionTabs[response.tabId].mem.mementoUrl] = extensionTabs[response.tabId].mem.originalUrl
                    /* 
                    * setting base url of the memento
                    * will be used to determine if the embedded resources are processed.
                    */
                    var protocol = ""
                    if (extensionTabs[response.tabId].mem.mementoUrl.slice(0,7) == "http://") {
                        protocol = "http://"
                    }
                    else if (extensionTabs[response.tabId].mem.mementoUrl.slice(0,8) == "https://") {
                        protocol = "https://"
                    }
                    baseUrl = extensionTabs[response.tabId].mem.mementoUrl.replace(protocol, "")
                    extensionTabs[response.tabId].mem.mementoBaseUrl = protocol + baseUrl.split("/")[0]

                    extensionTabs[response.tabId].mem.update()
                    return
                }
            }

            /* 
            * checking for non-native memento resources. 
            * setting psuedo memento datetime header
            */
            if (extensionTabs[response.tabId].mem.isMementoActive && extensionTabs[response.tabId].mem.isPsuedoMemento) {
                var aDt = ""
                if (extensionTabs[response.tabId].mem.specialDatetime) {
                    aDt = extensionTabs[response.tabId].mem.specialDatetime
                }
                else {
                    aDt = extensionTabs[response.tabId].mem.acceptDatetime
                }
                if (aDt) {
                    extensionTabs[response.tabId].mem.mementoDatetime = aDt.toGMTString()
                }
                extensionTabs[response.tabId].mem.shouldProcessEmbeddedResources = false
                extensionTabs[response.tabId].mem.mementoUrl = response.url
                extensionTabs[response.tabId].mem.visitedUrls[extensionTabs[response.tabId].mem.mementoUrl] = extensionTabs[response.tabId].mem.clickedOriginalUrl
            }
            extensionTabs[response.tabId].mem.update()
        },
        {urls: ["<all_urls>"]},
        ["responseHeaders"])

        chrome.webNavigation.onCommitted.addListener( function(details) {
            if (extensionTabs[details.tabId] == undefined) {
                return
            }
            if (details.transitionQualifiers == "forward_back" || 
                details.transitionQualifiers == "from_address_bar" || 
                details.transitionType == "typed" ||
                details.transitionType == "link") {
                
                var isVisitedMementoUrl = false

                for (i in extensionTabs[details.tabId].mem.visitedUrls) {
                    if (i == details.url) {
                        isVisitedMementoUrl = true
                        extensionTabs[details.tabId].mem.isMementoActive = true
                    }
                }
                if (!isVisitedMementoUrl) {
                    extensionTabs[details.tabId].mem.isMementoActive = false
                }
                extensionTabs[details.tabId].mem.update()
            }
            else if (details.transitionType == "reload") {
                extensionTabs[details.tabId].mem.clearCache()
            }
        })

        chrome.webRequest.onCompleted.addListener( function(details) {
            if (extensionTabs[details.tabId] == undefined) {
                return
            }
            if (extensionTabs[details.tabId].mem.isPsuedoMemento && details.type == "main_frame" && (details.statusCode < 300 || details.statusCode > 399)) {
                extensionTabs[details.tabId].mem.isPsuedoMemento = false
            }

            if (extensionTabs[details.tabId].mem.specialDatetime && details.type == "main_frame" && (details.statusCode < 300 || details.statusCode > 399)) {
                extensionTabs[details.tabId].mem.specialDatetime = false
            }
        },
        {urls: ["<all_urls>"]})
 
        chrome.storage.onChanged.addListener( function(changes, namespace) {
            extensionTabs[activeTabId].mem.readableAcceptDatetime = changes['accept-datetime-readable']['newValue']
            extensionTabs[activeTabId].mem.acceptDatetime = new Date(extensionTabs[activeTabId].mem.readableAcceptDatetime)
            if (extensionTabs[activeTabId].mem.mementoDatetime) {
                extensionTabs[activeTabId].mem.isDatetimeModified = true
            }
            extensionTabs[activeTabId].mem.update()
        })

        chrome.storage.local.get("accept-datetime-readable", function(items) {
            extensionTabs[activeTabId].mem.readableAcceptDatetime = items["accept-datetime-readable"]
            extensionTabs[activeTabId].mem.acceptDatetime = new Date(extensionTabs[activeTabId].mem.readableAcceptDatetime)
        })

        chrome.runtime.onInstalled.addListener(function(details) {
            chrome.contextMenus.removeAll()
            extensionTabs[activeTabId].mem.init()
        })
        chrome.contextMenus.onClicked.addListener(this.handleContextMenuClick)
    }
}

function Memento() {}

function Extension(tabId) {
    this.requestIds = []
    this.tId = tabId
    this.mem = new Memento()
}

var extensionTabs = {}
var activeTabId = 0

chrome.tabs.onCreated.addListener( function(tab) {
    console.log("TAB CREATED: " + tab.id)
    extensionTabs[tab.id] = new Extension(tab.id)
    extensionTabs[tab.id].init()
})

chrome.tabs.onActivated.addListener( function(tab) {
    activeTabId = tab.tabId
    var ext = extensionTabs[activeTabId]
    if (ext) {
        ext.getMementoObject().update()
    }
})

chrome.tabs.onReplaced.addListener( function(newTabId, oldTabId) {
    if (extensionTabs[oldTabId]) {
        console.log("tabs changed")
        extensionTabs[newTabId] = extensionTabs[oldTabId]
        delete extensionTabs[oldTabId]
    }
})


function deregisterEventHandlers() {
    chrome.storage.onChanged.removeListener( function() {})
    chrome.webRequest.onBeforeRequest.removeListener( function() {})
    chrome.webRequest.onBeforeSendHeaders.removeListener( function() {})
    chrome.webRequest.onHeadersReceived.removeListener( function() {})
}
