 define(["libs/backbone",
         "tantaman/web/widgets/DeltaDragControl",
         "common/Math2",
         "css!styles/slide_components/ComponentView.css",
         "strut/editor/GlobalEvents",
         "strut/deck/SlideCommands",
         "tantaman/web/undo_support/CmdListFactory"],
function(Backbone, DeltaDragControl, Math2, empty, key, SlideCommands, CmdListFactory) {
  var undoHistory = CmdListFactory.managedInstance('editor');
    return Backbone.View.extend({
      transforms: ["skewX", "skewY"],
      className: "component",
      events: function() {
        return {
          "mousedown": "mousedown",
          "click": "clicked",
          "click .removeBtn": "removeClicked",
          "change input[data-option='x']": "manualMoveX",
          "change input[data-option='y']": "manualMoveY",
          "deltadrag span[data-delta='skewX']": "skewX",
          "deltadrag span[data-delta='skewY']": "skewY",
          "deltadrag span[data-delta='rotate']": "rotate",
          "deltadrag span[data-delta='scale']": "scale",
          "deltadragStart span[data-delta='skewX']": "skewXStart",
          "deltadragStart span[data-delta='skewY']": "skewYStart",
          "deltadragStart span[data-delta='rotate']": "rotateStart",
          "deltadragStart span[data-delta='scale']": "scaleStart",
          'destroyed': 'remove'
        };
      },
      initialize: function() {
        this._dragging = false;
        this.allowDragging = true;
        this.model.on("change:selected", this.__selectionChanged, this);
        this.model.on("change:color", this._colorChanged, this);
        this.model.on("unrender", this._unrender, this);
        this._mouseup = this.stopdrag.bind(this);
        this._mousemove = this.mousemove.bind(this);
        $(document).bind("mouseup", this._mouseup);
        $(document).bind("mousemove", this._mousemove);
        this._deltaDrags = [];
        this.model.on("rerender", this._setUpdatedTransform, this);
        this.model.on("change:x", this._xChanged, this);
        this.model.on("change:y", this._yChanged, this);
        return this._lastDeltas = {
          dx: 0,
          dy: 0
        };
      },
      __selectionChanged: function(model, selected) {
        if (selected) {
          return this.$el.addClass("selected");
        } else {
          return this.$el.removeClass("selected");
        }
      },
      _colorChanged: function(model, color) {
        return this.$el.css("color", "#" + color);
      },
      _xChanged: function(model, value) {
        this.$el.css("left", value);
        return this.$xInput.val(value);
      },
      _yChanged: function(model, value) {
        this.$el.css("top", value);
        return this.$yInput.val(value);
      },
      clicked: function(e) {
        this.$el.css('z-index', zTracker.next());
        this.$el.trigger("focused");
        e.stopPropagation();
        return false;
      },
      removeClicked: function(e) {
        e.stopPropagation();
        return this.remove(true);
      },
      skewX: function(e, deltas) {
        this.model.setFloat("skewX", this._initialSkewX + Math.atan2(deltas.dx, 22));
        return this._setUpdatedTransform();
      },
      skewXStart: function() {
        return this._initialSkewX = this.model.get("skewX") || 0;
      },
      skewY: function(e, deltas) {
        this.model.setFloat("skewY", this._initialSkewY + Math.atan2(deltas.dy, 22));
        return this._setUpdatedTransform();
      },
      skewYStart: function() {
        return this._initialSkewY = this.model.get("skewY") || 0;
      },
      manualMoveX: function(e) {
        return this.model.setInt("x", e.target.value);
      },
      manualMoveY: function(e) {
        return this.model.setInt("y", e.target.value);
      },
      rotate: function(e, deltas) {
        var newRot, rot;
        rot = this._calcRot(deltas);
        newRot = this._initialRotate + rot - this._rotOffset;
        if (key.pressed.shift) {
          newRot = Math.floor(newRot / Math.PI * 8) / 8 * Math.PI;
        }
        this.model.setFloat("rotate", newRot);
        return this._setUpdatedTransform();
      },
      rotateStart: function(e, deltas) {
        this.updateOrigin();
        this._rotOffset = this._calcRot(deltas);
        return this._initialRotate = this.model.get("rotate") || 0;
      },
      updateOrigin: function() {
        var offset;
        offset = this.$el.offset();
        return this._origin = {
          x: this.$el.width() / 2 + offset.left,
          y: this.$el.height() / 2 + offset.top
        };
      },
      _calcRot: function(point) {
        return Math.atan2(point.y - this._origin.y, point.x - this._origin.x);
      },
      scaleStart: function(e, deltas) {
        var H, elHeight, elOffset, elWidth, theta;
        this.dragScale = this.$el.parent().css(window.browserPrefix + "transform");
        this.dragScale = parseFloat(this.dragScale.substring(7, this.dragScale.indexOf(","))) || 1;
        this._initialScale = this.model.get("scale");
        elOffset = this.$el.offset();
        elWidth = this.$el.width() * this._initialScale.x;
        elHeight = this.$el.height() * this._initialScale.y;
        H = Math.sqrt((elWidth / 2) * (elWidth / 2) + (elHeight / 2) * (elHeight / 2));
        theta = this.model.get("rotate") || 0;
        theta = theta + Math.atan2(elHeight / 2, elWidth / 2);
        this._scaleCenter = {
          x: elOffset.left + Math.abs(Math.cos(theta)),
          y: elOffset.top + Math.abs(Math.sin(theta))
        };
        this._scaleDeltas = {
          x: Math.abs(deltas.x - this._scaleCenter.x) / this.dragScale,
          y: Math.abs(deltas.y - this._scaleCenter.y) / this.dragScale
        };
        if (!(this.origSize != null)) {
          return this.origSize = {
            width: this.$el.width(),
            height: this.$el.height()
          };
        }
      },
      scale: function(e, deltas) {
        var dx, dy, fixRatioDisabled, scale;
        fixRatioDisabled = key.pressed.shift;
        dx = Math.abs(deltas.x - this._scaleCenter.x) / this.dragScale;
        dy = Math.abs(deltas.y - this._scaleCenter.y) / this.dragScale;
        scale = {
          x: this._initialScale.x * (dx / this._scaleDeltas.x),
          y: this._initialScale.y * (fixRatioDisabled ? dy / this._scaleDeltas.y : dx / this._scaleDeltas.x)
        };
        scale.width = scale.x * this.origSize.width;
        scale.height = scale.y * this.origSize.height;
        this.model.set("scale", scale);
        return this._setUpdatedTransform();
      },
      _setUpdatedTransform: function() {
        var newHeight, newWidth, obj, scale, transformStr;
        transformStr = this.buildTransformString();
        obj = {
          transform: transformStr
        };
        obj[window.browserPrefix + "transform"] = transformStr;
        this.$content.css(obj);
        scale = this.model.get("scale");
        if (this.origSize != null) {
          newWidth = scale.width || this.origSize.width;
          newHeight = scale.height || this.origSize.height;
          this.$el.css({
            width: newWidth,
            height: newHeight
          });
        }
        if (scale != null) {
          this.$contentScale.css(window.browserPrefix + "transform", "scale(" + scale.x + "," + scale.y + ")");
        }
        return this.$el.css(window.browserPrefix + "transform", "rotate(" + this.model.get("rotate") + "rad)");
      },
      buildTransformString: function() {
        var transformStr,
          _this = this;
        transformStr = "";
        this.transforms.forEach(function(transformName) {
          var transformValue;
          transformValue = _this.model.get(transformName);
          if (transformValue) {
            return transformStr += transformName + "(" + transformValue + "rad) ";
          }
        });
        return transformStr;
      },
      mousedown: function(e) {
        if (e.which === 1) {
          this.model.set("selected", true);
          this.$el.css("zIndex", zTracker.next());
          this.dragScale = this.$el.parent().css(window.browserPrefix + "transform");
          this.dragScale = parseFloat(this.dragScale.substring(7, this.dragScale.indexOf(","))) || 1;
          this._dragging = true;
          this._prevPos = {
            x: this.model.get("x"),
            y: this.model.get("y")
          };
          return this._prevMousePos = {
            x: e.pageX,
            y: e.pageY
          };
        }
      },
      render: function() {
        var size,
          _this = this;
        this.$el.html(this.__getTemplate()(this.model.attributes));
        this.$el.find("span[data-delta]").each(function(idx, elem) {
          var deltaDrag;
          deltaDrag = new DeltaDragControl($(elem), true);
          return _this._deltaDrags.push(deltaDrag);
        });
        this.$content = this.$el.find(".content");
        this.$contentScale = this.$el.find(".content-scale");
        this.__selectionChanged(this.model, this.model.get("selected"));
        this.$xInput = this.$el.find("[data-option='x']");
        this.$yInput = this.$el.find("[data-option='y']");
        this.$el.css({
          top: this.model.get("y"),
          left: this.model.get("x")
        });
        size = {
          width: this.$el.width(),
          height: this.$el.height()
        };
        if (size.width > 0 && size.height > 0) {
          this.origSize = size;
        }
        this._setUpdatedTransform();
        return this.$el;
      },
      __getTemplate: function() {
        return JST["strut.slide_components/Component"];
      },
      _unrender: function() {
        return this.remove(false);
      },
      remove: function(disposeModel) {
        var $doc, deltaDrag, idx, _ref;
        Backbone.View.prototype.remove.call(this);
        _ref = this._deltaDrags;
        for (idx in _ref) {
          deltaDrag = _ref[idx];
          deltaDrag.dispose();
        }
        if (disposeModel) {
          this.model.dispose();
        }

        this.model.off(null, null, this);
        $doc = $(document);
        $doc.unbind("mouseup", this._mouseup);
        $doc.unbind("mousemove", this._mousemove);
      },
      mousemove: function(e) {
        var dx, dy, gridSize, newX, newY, snapToGrid;
        if (this._dragging && this.allowDragging) {
          snapToGrid = key.pressed.shift;
          dx = e.pageX - this._prevMousePos.x;
          dy = e.pageY - this._prevMousePos.y;
          newX = this._prevPos.x + dx / this.dragScale;
          newY = this._prevPos.y + dy / this.dragScale;
          if (snapToGrid) {
            gridSize = 20;
            newX = Math.floor(newX / gridSize) * gridSize;
            newY = Math.floor(newY / gridSize) * gridSize;
          }
          this.model.setInt("x", newX);
          this.model.setInt("y", newY);
          if (!(this.dragStartLoc != null)) {
            return this.dragStartLoc = {
              x: newX,
              y: newY
            };
          }
        }
      },
      stopdrag: function() {
        var cmd;
        if (this._dragging) {
          this._dragging = false;
          if ((this.dragStartLoc != null) && this.dragStartLoc.x !== this.model.get("x") && this.dragStartLoc.y !== this.model.get("y")) {
            cmd = new SlideCommands.Move(this.dragStartLoc, this.model);
            undoHistory.push(cmd);
          }
          this.dragStartLoc = void 0;
        }
        return true;
      },
      constructor: function ComponentView() {
			Backbone.View.prototype.constructor.apply(this, arguments);
		}
    });
  });